import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.games import normalize_and_validate_participant_ids
from backend.api.users import get_all_users as list_employees
from backend.models import (
    Employee,
    Game,
    GameParticipant,
    LikeRequest,
    LikeTransaction,
    LimitParameter,
)
from backend.scripts.database import Base
from backend.services.bitrix_users import get_all_users
from backend.services.db_save_employee import save_or_update_employees
from backend.services.like_service import process_like_transaction


class EmployeeSyncTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

        today = datetime.now(timezone.utc).date()
        self.active_game = Game(
            name="Active",
            game_start=datetime.combine(today - timedelta(days=1), datetime.min.time()),
            game_end=datetime.combine(today + timedelta(days=1), datetime.min.time()),
            game_is_active=True,
            setting_limitParameter=LimitParameter.GAME,
            setting_limitValue=3,
            setting_limitToOneUser=3,
        )
        self.finished_game = Game(
            name="Finished",
            game_start=datetime.combine(today - timedelta(days=5), datetime.min.time()),
            game_end=datetime.combine(today - timedelta(days=1), datetime.min.time()),
            game_is_active=False,
            setting_limitParameter=LimitParameter.GAME,
            setting_limitValue=3,
            setting_limitToOneUser=3,
        )
        self.db.add_all([
            Employee(bitrix_id=101, name="Former", lastname="Employee", likes=1, coins=100,
                     is_gamer=True, is_admin=False, bitrix_active=True),
            Employee(bitrix_id=102, name="Current", lastname="Employee", likes=0, coins=0,
                     is_gamer=True, is_admin=True, bitrix_active=True),
            self.active_game,
            self.finished_game,
        ])
        self.db.flush()
        self.db.add_all([
            GameParticipant(game_id=self.active_game.id, employee_bitrix_id=101),
            GameParticipant(game_id=self.active_game.id, employee_bitrix_id=102),
            GameParticipant(game_id=self.finished_game.id, employee_bitrix_id=101),
            LikeTransaction(
                game_id=self.finished_game.id,
                from_user_bitrix_id=102,
                to_user_bitrix_id=101,
                message="Thanks",
            ),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_fired_employee_leaves_unfinished_games_but_keeps_history(self):
        count = save_or_update_employees([
            {"ID": "101", "NAME": "Former", "LAST_NAME": "Employee", "ACTIVE": False},
            {"ID": "102", "NAME": "Current", "LAST_NAME": "Employee", "ACTIVE": True},
        ], self.db, sync_bitrix_status=True)

        former = self.db.query(Employee).filter_by(bitrix_id=101).one()
        self.assertEqual(count, 2)
        self.assertFalse(former.bitrix_active)
        self.assertTrue(former.is_gamer)
        self.assertEqual((former.likes, former.coins), (1, 100))
        self.assertFalse(self.db.query(GameParticipant).filter_by(
            game_id=self.active_game.id, employee_bitrix_id=101
        ).count())
        self.assertEqual(self.db.query(GameParticipant).filter_by(
            game_id=self.finished_game.id, employee_bitrix_id=101
        ).count(), 1)
        self.assertEqual(self.db.query(LikeTransaction).count(), 1)
        self.assertEqual(normalize_and_validate_participant_ids(self.db, [101],
                         preserved_ids={101}), [101])
        with self.assertRaises(HTTPException):
            normalize_and_validate_participant_ids(self.db, [101])

    def test_missing_active_status_does_not_modify_participants(self):
        with self.assertRaises(ValueError):
            save_or_update_employees([
                {"ID": "101", "NAME": "Former", "ACTIVE": False},
                {"ID": "102", "NAME": "Current"},
            ], self.db, sync_bitrix_status=True)

        self.assertTrue(self.db.query(Employee).filter_by(bitrix_id=101).one().bitrix_active)
        self.assertEqual(self.db.query(GameParticipant).filter_by(
            game_id=self.active_game.id, employee_bitrix_id=101
        ).count(), 1)

    def test_fired_employee_is_hidden_from_game_choices_but_visible_in_settings(self):
        self.db.query(Employee).filter_by(bitrix_id=101).one().bitrix_active = False
        self.db.commit()

        choices = asyncio.run(list_employees(
            only_gamers=True, game_id=self.active_game.id, db=self.db
        ))
        settings = asyncio.run(list_employees(db=self.db))

        self.assertEqual([row["bitrix_id"] for row in choices], [102])
        self.assertFalse(next(row for row in settings if row["bitrix_id"] == 101)["bitrix_active"])

    def test_rehired_employee_is_not_automatically_added_back_to_games(self):
        save_or_update_employees([
            {"ID": "101", "ACTIVE": False},
            {"ID": "102", "ACTIVE": True},
        ], self.db, sync_bitrix_status=True)
        save_or_update_employees([
            {"ID": "101", "ACTIVE": True},
            {"ID": "102", "ACTIVE": True},
        ], self.db, sync_bitrix_status=True)

        self.assertTrue(self.db.query(Employee).filter_by(bitrix_id=101).one().bitrix_active)
        self.assertEqual(self.db.query(GameParticipant).filter_by(
            game_id=self.active_game.id, employee_bitrix_id=101
        ).count(), 0)

    def test_inactive_recipient_cannot_receive_even_with_stale_membership(self):
        self.db.query(Employee).filter_by(bitrix_id=101).one().bitrix_active = False
        self.db.commit()

        with self.assertRaises(HTTPException) as raised:
            process_like_transaction(self.db, LikeRequest(
                game_id=self.active_game.id, from_id=102, to_id=101
            ))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(self.db.query(LikeTransaction).count(), 1)

    def test_inactive_sender_cannot_send_even_with_stale_membership(self):
        self.db.query(Employee).filter_by(bitrix_id=101).one().bitrix_active = False
        self.db.commit()

        with self.assertRaises(HTTPException) as raised:
            process_like_transaction(self.db, LikeRequest(
                game_id=self.active_game.id, from_id=101, to_id=102
            ))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(self.db.query(LikeTransaction).count(), 1)


class BitrixPaginationTests(unittest.TestCase):
    def test_incomplete_second_page_aborts_sync(self):
        class Response:
            def __init__(self, payload):
                self.payload = payload

            def raise_for_status(self):
                pass

            def json(self):
                return self.payload

        class Client:
            def __init__(self):
                self.requests = []
                self.pages = [
                    Response({"total": 51, "result": [{"ID": str(i)} for i in range(50)]}),
                    Response({"error": "expired_token"}),
                ]

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                pass

            async def post(self, _url, json):
                self.requests.append(json)
                return self.pages.pop(0)

        client = Client()
        with patch("backend.services.bitrix_users.httpx.AsyncClient", return_value=client):
            with self.assertRaises(ValueError):
                asyncio.run(get_all_users("token", "example.bitrix24.ru"))

        self.assertEqual(client.requests[0]["filter"], {"USER_TYPE": "employee"})
        self.assertEqual(client.requests[1]["start"], 50)


if __name__ == "__main__":
    unittest.main()
