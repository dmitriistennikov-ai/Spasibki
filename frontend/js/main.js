
function initTabs() {
  const btns = [...document.querySelectorAll('.tabs__button')];
  const panels = [...document.querySelectorAll('.tab-content')];
  if (!btns.length || !panels.length) return;
  btns.forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.tab;
    btns.forEach(b => { const on = b === btn;
      b.classList.toggle('tabs__button--active', on); b.setAttribute('aria-selected', String(on));
    });
    panels.forEach(p => { const on = p.id === id;
      p.classList.toggle('tab-content--active', on);
      p.hidden = !on;
    });
  }));
}


function getCurrentUserId() {
    const qs = new URLSearchParams(location.search);
    const id = qs.get('user_id');
    return id || null;
}


function toast(msg) {
    const bar = document.getElementById('message-bar');
    if (!bar) return;
    bar.textContent = msg;
    bar.classList.add('is-visible');
    setTimeout(() => bar.classList.remove('is-visible'), 3500);
}

const THANKS_GAME_PLACEHOLDER = 'Выберите игру';
const THANKS_RECIPIENT_PLACEHOLDER = 'Кому отправить спасибку';
const THANKS_RECIPIENT_LOCKED_PLACEHOLDER = 'Сначала выберите игру';
let currentUserProfile = null;

function setStickerToggleState(toggleBtn, selected = false, label = 'Выберите стикер') {
    if (!toggleBtn) return;
    toggleBtn.textContent = '';
    toggleBtn.classList.toggle('is-selected', selected);
    toggleBtn.setAttribute('title', selected ? `Стикер: ${label}` : 'Выберите стикер');
    toggleBtn.setAttribute('aria-label', selected ? `Выбран стикер: ${label}` : 'Выберите стикер');
}


const THANKS_PROGRESS_LEVELS = [
    { label: 'Хороший работник', value: 10 },
    { label: 'Отличный работник', value: 20 },
    { label: 'Самый лучший', value: 30 },
    { label: 'Легенда', value: 50 },
];


function updateThanksProgressScale(totalLikes) {
    const safeLikes = Math.max(0, Number(totalLikes || 0));
    const titleEl = document.getElementById('home-thanks-progress-title');
    const currentEl = document.getElementById('home-thanks-progress-current');
    const fillEl = document.getElementById('home-thanks-progress-fill');
    const trackEl = document.querySelector('.home-thanks-progress__track');
    const markerEls = [...document.querySelectorAll('.home-thanks-progress__marker')];

    if (!titleEl || !fillEl || !trackEl) return;

    if (currentEl) {
        currentEl.textContent = Number(safeLikes).toLocaleString('ru-RU');
    }

    const maxThreshold = THANKS_PROGRESS_LEVELS[THANKS_PROGRESS_LEVELS.length - 1]?.value || 50;
    const progressPercent = Math.min(100, (safeLikes / maxThreshold) * 100);
    fillEl.style.width = `${progressPercent}%`;

    const currentLevel = [...THANKS_PROGRESS_LEVELS].reverse().find((level) => safeLikes >= level.value) || null;

    if (currentLevel) {
        titleEl.hidden = false;
        titleEl.textContent = currentLevel.label;
    } else {
        titleEl.textContent = '';
        titleEl.hidden = true;
    }

    trackEl.setAttribute(
        'aria-label',
        currentLevel
            ? `Уровень: ${currentLevel.label}. Получено ${safeLikes} Спасибок из ${maxThreshold} для максимального уровня`
            : `Получено ${safeLikes} Спасибок. До первого уровня нужно ${THANKS_PROGRESS_LEVELS[0]?.value ?? 10}`,
    );

    markerEls.forEach((markerEl, index) => {
        const threshold = THANKS_PROGRESS_LEVELS[index]?.value;
        markerEl.classList.toggle('is-reached', typeof threshold === 'number' && safeLikes >= threshold);
    });
}


async function loadCurrentUser() {
    try {
        const userId = getCurrentUserId();
        if (!userId) {
            toast('Нет user_id в URL');
            return;
        }

        const res = await fetch(`/api/user?user_id=${encodeURIComponent(userId)}`, {
            cache: 'no-store',
        });
        if (!res.ok) {
            throw new Error(`Не удалось загрузить пользователя (${res.status})`);
        }
        const u = await res.json();
        currentUserProfile = u;
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v ?? '—';
        };
        const fullName = [u.name, u.lastname].filter(Boolean).join(' ');
        set('user-fullname', fullName || '—');
        const likesTotal = Number(u.likes ?? 0);
        set('current_user-thanks', likesTotal.toLocaleString('ru-RU'));
        set('current_user-balance', Number(u.coins ?? 0).toLocaleString('ru-RU'));
        set('home-user-position', u.position || 'Сотрудник');
        updateThanksProgressScale(likesTotal);
        const settingsEventsBtn = document.getElementById('settings-events-nav-btn');
        if (settingsEventsBtn) {
            settingsEventsBtn.hidden = !Boolean(u.is_superadmin);
        }

        const avatarEl = document.querySelector('.user-info__avatar');
        if (avatarEl && u.photo_url) {
            avatarEl.innerHTML = `<img src="${u.photo_url}" alt="${fullName}" class="user-avatar__image">`;
        } else if (avatarEl && !u.photo_url) {
            avatarEl.innerHTML = '<div class="user-info__icon">👤</div>';
        }

        if (!u.is_admin) {
            const settingsTabBtn = document.querySelector('.tabs__button[data-tab="settings"]');
            const settingsPanel  = document.getElementById('settings');

            if (settingsTabBtn) {
                settingsTabBtn.remove();
            }
            if (settingsPanel) {
                settingsPanel.remove();
            }
            document.querySelector('.home-nav__item[data-home-target="settings"]')?.remove();

            const activeBtn = document.querySelector('.tabs__button.tabs__button--active');
            if (!activeBtn) {
                const myTabBtn = document.querySelector('.tabs__button[data-tab="my-page"]');
                const myPanel  = document.getElementById('my-page');
                if (myTabBtn && myPanel) {
                    myTabBtn.classList.add('tabs__button--active');
                    myTabBtn.setAttribute('aria-selected', 'true');
                    myPanel.classList.add('tab-content--active');
                    myPanel.hidden = false;
                }
            }
        }
        syncHomeNavSelection();
        await loadHomeDashboardData();
    }   catch (e) {
        console.error(e);
        toast(e.message || 'Ошибка загрузки сотрудника');
    }
}


async function fetchUsers() {
    const r = await fetch('/api/users?only_gamers=true');
    if(!r.ok) throw new Error(`Не удалось загрузить сотрудников (${r.status})`);
    return r.json();
}


async function fetchAvailableThanksGames(userBitrixId) {
    const r = await fetch('/api/games/all');
    if (!r.ok) throw new Error(`Не удалось загрузить список игр (${r.status})`);

    const allGames = await r.json();
    const userId = Number(userBitrixId || '0');
    const nowTs = Date.now();

    return (Array.isArray(allGames) ? allGames : [])
        .filter((game) => {
            if (!game || !game.game_is_active) return false;
            if (!Array.isArray(game.participant_ids)) return false;
            const participants = game.participant_ids.map((id) => String(id));
            if (!participants.includes(String(userId))) return false;
            if (!game.game_end) return true;
            const endTs = new Date(game.game_end).getTime();
            return Number.isFinite(endTs) ? endTs >= nowTs : true;
        })
        .sort((a, b) => {
            const aTs = new Date(a.game_end || a.game_start || 0).getTime();
            const bTs = new Date(b.game_end || b.game_start || 0).getTime();
            return aTs - bTs;
        });
}


async function fetchLikesInfo(bitrixId, gameId = null) {
    const query = gameId ? `?game_id=${encodeURIComponent(gameId)}` : '';
    const res = await fetch(`/api/likes-info/${encodeURIComponent(bitrixId)}${query}`);
    if (!res.ok) {
        let msg = `Не удалось получить информацию о Спасибках (${res.status})`;
        let detail = '';
        try {
            const data = await res.json();
            if (data && data.detail) {
                detail = String(data.detail);
                msg = detail;
            }
        } catch (_) {}

        if (res.status === 403 && detail === 'Сотрудник не участвует в выбранной игре') {
            return {
                received_likes: 0,
                remaining_likes: 0,
                sent_likes: 0,
                game_name: '',
                game_id: gameId ? Number(gameId) : null,
                has_active_game: true,
                is_participant: false,
            };
        }
        throw new Error(msg);
    }
    return res.json();
}


async function openThanksModal() {
    const modal = document.getElementById('thanks-modal');
    const recipientContainer = modal?.querySelector('.home-composer__recipient--employee');
    const gameSelect = modal?.querySelector('#thanks-game');
    const gameDropdown = modal?.querySelector('#thanks-game-dropdown');
    const gameTrigger = gameDropdown?.querySelector('.thanks-to-dropdown__trigger');
    const gameList = gameDropdown?.querySelector('.thanks-to-dropdown__list');

    const select = modal?.querySelector('#thanks-to');
    const dropdown = modal?.querySelector('#thanks-to-dropdown');
    const trigger = dropdown?.querySelector('.thanks-to-dropdown__trigger');
    const list = dropdown?.querySelector('.thanks-to-dropdown__list');

    if (!modal || !recipientContainer || !gameSelect || !gameDropdown || !gameTrigger || !gameList || !select || !dropdown || !trigger || !list) return;

    const ensureDropdownSearch = (rootDropdown, rootList, placeholder) => {
        let input = rootDropdown.querySelector('.thanks-to-dropdown__search');
        if (!input) {
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'thanks-to-dropdown__search';
            input.autocomplete = 'off';
            rootDropdown.insertBefore(input, rootList);
        }
        input.placeholder = placeholder;
        input.value = '';
        input.hidden = true;
        return input;
    };

    const gameSearchInput = ensureDropdownSearch(gameDropdown, gameList, 'Поиск игры...');
    const searchInput = ensureDropdownSearch(dropdown, list, 'Начните вводить имя...');

    gameSelect.innerHTML = '<option value="" disabled selected>Загрузка…</option>';
    gameSelect.value = '';
    gameTrigger.textContent = 'Загрузка…';
    gameTrigger.setAttribute('title', 'Загрузка…');
    gameTrigger.setAttribute('aria-expanded', 'false');
    gameTrigger.disabled = true;
    gameList.hidden = true;
    gameList.innerHTML = '';

    select.innerHTML = '<option value="" disabled selected>Загрузка…</option>';
    select.value = '';
    trigger.textContent = THANKS_RECIPIENT_LOCKED_PLACEHOLDER;
    trigger.setAttribute('title', THANKS_RECIPIENT_LOCKED_PLACEHOLDER);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.disabled = true;
    list.hidden = true;
    list.innerHTML = '';

    const userId = getCurrentUserId();

    const buildUsersListHtml = (usersToRender) => usersToRender.map(u => {
        const fullName = [u.name, u.lastname].filter(Boolean).join(' ');
        const isDisabled = userId && String(u.bitrix_id) === String(userId);
        const disabledClass = isDisabled ? ' thanks-to-dropdown__item--disabled' : '';
        const photoSrc = u.photo_url || '';

        return `
            <li
                class="thanks-to-dropdown__item${disabledClass}"
                role="option"
                data-id="${u.bitrix_id}"
                aria-disabled="${isDisabled ? 'true' : 'false'}"
            >
                <span class="thanks-to-dropdown__avatar">
                    ${photoSrc ? `<img src="${photoSrc}" alt="">` : ''}
                </span>
                <span class="thanks-to-dropdown__name">${fullName}</span>
            </li>
        `;
    }).join('');

    const lockRecipientSelector = (label = THANKS_RECIPIENT_LOCKED_PLACEHOLDER) => {
        select.value = '';
        select.innerHTML = '<option value="" disabled selected>Сначала выберите игру…</option>';
        trigger.textContent = label;
        trigger.setAttribute('title', label);
        trigger.disabled = true;
        trigger.setAttribute('aria-expanded', 'false');
        list.innerHTML = '';
        list.hidden = true;
        searchInput.value = '';
        searchInput.hidden = true;
        dropdown._users = [];
    };

    const renderRecipientsForGame = (gameId) => {
        const allUsers = Array.isArray(dropdown._allUsers) ? dropdown._allUsers : [];
        const allGames = Array.isArray(gameDropdown._games) ? gameDropdown._games : [];
        const game = allGames.find((item) => String(item.id) === String(gameId));
        if (!game) {
            lockRecipientSelector();
            return;
        }

        const participants = new Set((Array.isArray(game.participant_ids) ? game.participant_ids : []).map((id) => String(id)));
        const usersInGame = allUsers.filter((user) => participants.has(String(user.bitrix_id)));
        const usersAvailableForSend = usersInGame.filter((user) => String(user.bitrix_id) !== String(userId));

        dropdown._users = usersInGame;
        select.value = '';
        select.innerHTML = ['<option value="" disabled selected>Выберите сотрудника…</option>']
            .concat(
                usersInGame.map((u) => {
                    const label = [u.name, u.lastname].filter(Boolean).join(' ');
                    const isDisabled = userId && String(u.bitrix_id) === String(userId);
                    return `<option value="${u.bitrix_id}"${isDisabled ? ' disabled' : ''}>${label}</option>`;
                }),
            )
            .join('');
        list.innerHTML = buildUsersListHtml(usersInGame);
        searchInput.value = '';
        searchInput.hidden = true;
        list.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');

        if (usersAvailableForSend.length === 0) {
            trigger.textContent = 'Нет доступных получателей';
            trigger.setAttribute('title', 'Нет доступных получателей');
            trigger.disabled = true;
            return;
        }

        trigger.textContent = THANKS_RECIPIENT_PLACEHOLDER;
        trigger.setAttribute('title', THANKS_RECIPIENT_PLACEHOLDER);
        trigger.disabled = false;
    };

    try {
        const [users, availableGames] = await Promise.all([
            fetchUsers(),
            fetchAvailableThanksGames(userId),
        ]);
        dropdown._allUsers = users;
        gameDropdown._games = availableGames;
        gameSelect.dataset.hasGames = availableGames.length > 0 ? '1' : '0';

        if (!gameSelect.dataset.gameSelectInit) {
            gameSelect.addEventListener('change', () => {
                renderRecipientsForGame(gameSelect.value);
                refreshHomeComposerInfo().catch(() => {});
            });
            gameSelect.dataset.gameSelectInit = '1';
        }

        if (!gameTrigger.dataset.dropdownInit) {
            gameTrigger.addEventListener('click', () => {
                if (gameTrigger.disabled) return;
                const isOpen = !gameList.hidden;
                gameList.hidden = isOpen;
                gameSearchInput.hidden = isOpen;
                gameTrigger.setAttribute('aria-expanded', String(!isOpen));

                if (!isOpen) {
                    gameSearchInput.focus();
                }
            });

            gameSearchInput.addEventListener('input', () => {
                const query = gameSearchInput.value.trim().toLowerCase();
                const allGames = gameDropdown._games || [];
                const filtered = !query
                    ? allGames
                    : allGames.filter((game) => String(game.name || '').toLowerCase().includes(query));

                gameList.innerHTML = filtered.map((game) => (
                    `<li class="thanks-to-dropdown__item" role="option" data-id="${game.id}">
                        <span class="thanks-to-dropdown__name">${esc(game.name || 'Без названия')}</span>
                    </li>`
                )).join('');
            });

            gameList.addEventListener('click', (event) => {
                const item = event.target.closest('.thanks-to-dropdown__item');
                if (!item) return;

                const id = String(item.dataset.id || '');
                if (!id) return;

                const selectedGame = (gameDropdown._games || []).find((game) => String(game.id) === id);
                const label = selectedGame?.name || 'Без названия';

                gameSelect.value = id;
                gameSelect.dispatchEvent(new Event('change', { bubbles: true }));

                gameTrigger.textContent = label;
                gameTrigger.setAttribute('title', label);
                gameList.hidden = true;
                gameSearchInput.hidden = true;
                gameTrigger.setAttribute('aria-expanded', 'false');
            });

            document.addEventListener('click', (event) => {
                if (!gameDropdown.contains(event.target)) {
                    gameList.hidden = true;
                    gameSearchInput.hidden = true;
                    gameTrigger.setAttribute('aria-expanded', 'false');
                }
            });

            gameTrigger.dataset.dropdownInit = '1';
        }

        if (availableGames.length === 0) {
            gameSelect.innerHTML = '<option value="" disabled selected>Нет доступных игр</option>';
            gameSelect.value = '';
            gameTrigger.textContent = 'Нет доступных игр';
            gameTrigger.setAttribute('title', 'Нет доступных игр');
            gameTrigger.disabled = true;
            lockRecipientSelector('Нет доступных игр');
            recipientContainer.setAttribute('hidden', '');
            await refreshHomeComposerInfo();
            return;
        }

        recipientContainer.removeAttribute('hidden');
        gameSelect.innerHTML = ['<option value="" disabled selected>Выберите игру…</option>']
            .concat(
                availableGames.map((game) => `<option value="${game.id}">${esc(game.name || 'Без названия')}</option>`),
            )
            .join('');
        gameSelect.value = '';
        gameTrigger.textContent = THANKS_GAME_PLACEHOLDER;
        gameTrigger.setAttribute('title', THANKS_GAME_PLACEHOLDER);
        gameTrigger.disabled = false;
        gameList.innerHTML = availableGames.map((game) => (
            `<li class="thanks-to-dropdown__item" role="option" data-id="${game.id}">
                <span class="thanks-to-dropdown__name">${esc(game.name || 'Без названия')}</span>
            </li>`
        )).join('');
        lockRecipientSelector();

        if (!trigger.dataset.dropdownInit) {
            trigger.addEventListener('click', () => {
                if (trigger.disabled) return;
                const isOpen = !list.hidden;
                list.hidden = isOpen;
                searchInput.hidden = isOpen;
                trigger.setAttribute('aria-expanded', String(!isOpen));

                if (!isOpen) {
                    searchInput.focus();
                }
            });

            searchInput.addEventListener('input', () => {
                const query = searchInput.value.trim().toLowerCase();
                const allUsers = dropdown._users || [];

                const filtered = !query
                    ? allUsers
                    : allUsers.filter(u => {
                        const fullName = [u.name, u.lastname]
                            .filter(Boolean)
                            .join(' ')
                            .toLowerCase();
                        return fullName.includes(query);
                    });

                list.innerHTML = buildUsersListHtml(filtered);
            });

            list.addEventListener('click', (event) => {
                const item = event.target.closest('.thanks-to-dropdown__item');
                if (!item) return;

                const isDisabled = item.classList.contains('thanks-to-dropdown__item--disabled');
                if (isDisabled) return;

                const id = item.dataset.id;
                const nameEl = item.querySelector('.thanks-to-dropdown__name');
                const label = nameEl ? nameEl.textContent : '';

                select.value = id;
                select.dispatchEvent(new Event('change', { bubbles: true }));

                trigger.textContent = label;
                trigger.setAttribute('title', label);
                list.hidden = true;
                searchInput.hidden = true;
                trigger.setAttribute('aria-expanded', 'false');
            });

            document.addEventListener('click', (event) => {
                if (!dropdown.contains(event.target)) {
                    list.hidden = true;
                    searchInput.hidden = true;
                    trigger.setAttribute('aria-expanded', 'false');
                }
            });

            trigger.dataset.dropdownInit = '1';
        }

        await refreshHomeComposerInfo();
    } catch (e) {
        console.error(e);
        toast(e.message || 'Ошибка загрузки данных для отправки');
        trigger.textContent = 'Ошибка загрузки';
        trigger.setAttribute('title', 'Ошибка загрузки');
        trigger.disabled = true;
        gameTrigger.textContent = 'Ошибка загрузки';
        gameTrigger.setAttribute('title', 'Ошибка загрузки');
        gameTrigger.disabled = true;
        list.hidden = true;
        searchInput.hidden = true;
        gameList.hidden = true;
        gameSearchInput.hidden = true;
        gameSelect.dataset.hasGames = '0';
        await refreshHomeComposerInfo();
    }
}



function closeThanksModal() {
    const modal = document.getElementById('thanks-modal');
    if (!modal) return;

    const msgInput = modal.querySelector('#thanks-message');
    if (msgInput) msgInput.value = '';

    const gameInput = modal.querySelector('#thanks-game');
    if (gameInput) gameInput.value = '';

    const gameDropdownTrigger = modal.querySelector('#thanks-game-dropdown .thanks-to-dropdown__trigger');
    if (gameDropdownTrigger) {
        gameDropdownTrigger.textContent = THANKS_GAME_PLACEHOLDER;
        gameDropdownTrigger.setAttribute('title', THANKS_GAME_PLACEHOLDER);
        gameDropdownTrigger.setAttribute('aria-expanded', 'false');
        gameDropdownTrigger.disabled = gameInput?.dataset?.hasGames === '0';
    }

    const toInput = modal.querySelector('#thanks-to');
    if (toInput) toInput.value = '';

    const dropdownTrigger = modal.querySelector('#thanks-to-dropdown .thanks-to-dropdown__trigger');
    if (dropdownTrigger) {
        dropdownTrigger.textContent = THANKS_RECIPIENT_LOCKED_PLACEHOLDER;
        dropdownTrigger.setAttribute('title', THANKS_RECIPIENT_LOCKED_PLACEHOLDER);
        dropdownTrigger.disabled = true;
    }

    const selectedInput = modal.querySelector('#selected-sticker-id');
    if (selectedInput) selectedInput.value = '';

    const allStickerButtons = modal.querySelectorAll('.sticker-item');
    allStickerButtons.forEach(btn => {
        btn.classList.remove('sticker-item--active');
    });

    const stickerToggle = modal.querySelector('#sticker-selector-toggle');
    setStickerToggleState(stickerToggle, false, 'Выберите стикер');

    modal.querySelectorAll('.thanks-to-dropdown__list').forEach((dropdownList) => {
        dropdownList.hidden = true;
    });
    modal.querySelectorAll('.thanks-to-dropdown__search').forEach((dropdownSearch) => {
        dropdownSearch.hidden = true;
        dropdownSearch.value = '';
    });

    const stickerGrid = modal.querySelector('#sticker-selector');
    if (stickerGrid) stickerGrid.setAttribute('hidden', '');
    if (stickerToggle) stickerToggle.setAttribute('aria-expanded', 'false');
}


async function submitThanks(e) {
    e.preventDefault();
    const modal = document.getElementById('thanks-modal');
    if (!modal) return;

    const gameId = Number(modal.querySelector('#thanks-game')?.value || '0');
    if (!gameId) {
        toast('Сначала выберите игру');
        return;
    }

    const toId = Number(modal.querySelector('#thanks-to')?.value || '0');
    const fromId = Number(getCurrentUserId() || '0');
    const stickerId = Number(modal.querySelector('#selected-sticker-id')?.value || '0');
    if (!toId || toId === fromId) {
        toast('Выберите получателя');
        return;
    }
    const msg = (modal.querySelector('#thanks-message')?.value || '').trim();
    const payload = { from_id: fromId, to_id: toId, game_id: gameId };
    if (msg) payload.message = msg;
    if (stickerId > 0) payload.sticker_id = stickerId;
    try {
        const resp = await fetch('/api/like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            let msg = `Ошибка отправки (${resp.status})`;
            try {
                const data = await resp.json();
                if (data?.detail) {
                    msg = data.detail;
                }
            } catch (_) {
            }
            throw new Error(msg);
        }
        toast('Спасибка отправлена!');
        await loadCurrentUser();
        await refreshGameLikesInfo();
        await loadLiveFeedHistory();
        await loadOverallRating();

        closeThanksModal();
    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось отправить');
    }
}


let currentLikesPage = 1;
let likesHistoryRows = [];
let likesFilter = null;
let likesHistoryLimit = 5;
let likesHistoryHasMore = true;


async function loadLikesHistory(limit = likesHistoryLimit, offset = 0, { append = false } = {}) {
    try {
        const userId = getCurrentUserId();
        if (!userId) return;

        const res = await fetch(
            `/api/user/${encodeURIComponent(userId)}/likes?limit=${limit}&offset=${offset}`
        );
        if (!res.ok) throw new Error(`Не удалось загрузить историю (${res.status})`);

        const { likes, total_pages } = await res.json();

        if (!append) {
            likesHistoryRows = likes;
        } else {
            likesHistoryRows = likesHistoryRows.concat(likes);
        }

        likesHistoryHasMore = currentLikesPage < total_pages;

        applyLikesFilter();
        updateLikesHistoryPager(total_pages);
    } catch (e) {
        console.error(e);
        likesHistoryRows = [];
        applyLikesFilter();
        toast(e.message || 'Ошибка загрузки истории');
    }
}


function updateLikesHistoryPager(totalPages) {
    const prevButton = document.getElementById('likes-history-prev-page-btn');
    const nextButton = document.getElementById('likes-history-next-page-btn');
    const currentPageSpan = document.getElementById('likes-history-current-page');

    currentPageSpan.textContent = `Страница ${currentLikesPage}`;

    prevButton.disabled = currentLikesPage === 1;
    nextButton.disabled = currentLikesPage === totalPages || likesHistoryRows.length === 0;
}


async function reloadLikesHistory() {
  likesHistoryHasMore = true;
  await loadLikesHistory(likesHistoryLimit, 0, { append: false });
}


async function renderLikesHistory(rows) {
    const tbody = document.querySelector('#likes-history tbody');
    if (!tbody) return;
    if (!rows || !rows.length) {
        tbody.innerHTML = `<tr><td class="table__empty" colspan="5">Спасибок еще не было</td></tr>`;
        return;
    }

    const rowsHtml = await Promise.all(rows.map(async (r) => {
        const stickerUrl = r.sticker_id ? await getStickerUrl(r.sticker_id) : null;

        return `
            <tr>
                <td>${esc(fmtDate(r.date))}</td>
                <td>${esc(r.from_user_name)}</td>
                <td>${esc(r.to_user_name)}</td>
                <td>${esc(r.msg || '')}</td>
                <td>
                    ${stickerUrl ? `<img src="${esc(stickerUrl)}" alt="Стикер" style="width: 48px; height: 48px; object-fit: contain;" />` : ''}
                </td>
            </tr>
        `;
    }));

    tbody.innerHTML = rowsHtml.join('');
}


const stickerUrlCache = new Map();


async function getStickerUrl(stickerId) {
    if (!stickerId) return null;

    if (stickerUrlCache.has(stickerId)) {
        return stickerUrlCache.get(stickerId);
    }

    try {
        const res = await fetch(`/api/sticker/${stickerId}`);
        if (res.ok) {
            const data = await res.json();
            const url = data.url;

            stickerUrlCache.set(stickerId, url);
            return url;
        }
        return null;
    } catch (e) {
        console.error('Ошибка загрузки стикера:', e);
        return null;
    }
}


function initLikesFilters() {
    const toMe = document.getElementById('likes-filter-to-me');
    const fromMe = document.getElementById('likes-filter-from-me');
    if (toMe) toMe.addEventListener('click', () => {
        likesFilter = (likesFilter === 'received') ? null : 'received';
        applyLikesFilter();
    });
    if (fromMe) fromMe.addEventListener('click', () => {
        likesFilter = (likesFilter === 'sent') ? null : 'sent';
        applyLikesFilter();
    });
    }


function applyLikesFilter() {
    const rows = (!likesFilter) ? likesHistoryRows : likesHistoryRows.filter(r => r.type === likesFilter);
    renderLikesHistory(rows);
    const toMe = document.getElementById('likes-filter-to-me');
    const fromMe = document.getElementById('likes-filter-from-me');
    const setBtn = (btn, on) => {
    if(!btn) return;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
    };
    setBtn(toMe, likesFilter === 'received');
    setBtn(fromMe, likesFilter === 'sent');
}


let liveFeedPage = 1;
let liveFeedHistoryRows = [];
let liveFeedHistoryLimit = 10;
let liveFeedTotalPages = 1;


async function loadLiveFeedHistory(limit = liveFeedHistoryLimit, offset = 0) {
    const tbody = document.querySelector('#live-feed-thanks tbody');
    if (tbody) tbody.innerHTML = `<tr><td class="table__empty" colspan="4">Загрузка…</td></tr>`;

    try {
        const res = await fetch(
            `/api/likes/feed?limit=${limit}&offset=${offset}`
        );
        if (!res.ok) throw new Error(`Не удалось загрузить ленту (${res.status})`);

        const data = await res.json();

        liveFeedHistoryRows = data.likes;
        liveFeedTotalPages = data.total_pages;

        updateLiveFeedPager();
        renderLiveFeedHistory(liveFeedHistoryRows);
    } catch (e) {
        console.error(e);
        liveFeedHistoryRows = [];
        renderLiveFeedHistory(liveFeedHistoryRows);
        toast(e.message || 'Ошибка загрузки ленты');
        liveFeedTotalPages = 1;
        updateLiveFeedPager();
    }
}


function updateLiveFeedPager() {
    const prevButton = document.getElementById('live-feed-thanks-prev-page-btn');
    const nextButton = document.getElementById('live-feed-thanks-next-page-btn');
    const currentPageSpan = document.getElementById('live-feed-thanks-current-page');

    if (!currentPageSpan || !prevButton || !nextButton) return;

    currentPageSpan.textContent = `Страница ${liveFeedPage}`;

    prevButton.disabled = liveFeedPage === 1;
    nextButton.disabled = liveFeedPage >= liveFeedTotalPages || liveFeedHistoryRows.length === 0;
}


function renderLiveFeedHistory(rows) {
    const tbody = document.querySelector('#live-feed-thanks tbody');
    if(!tbody) return;

    if(!rows || !rows.length) {
        tbody.innerHTML = `<tr><td class="table__empty" colspan="5">Спасибок еще не было</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => `
        <tr>
            <td>${esc(fmtDate(r.date))}</td>
            <td>${esc(r.from_user_name)}</td>
            <td>${esc(r.to_user_name)}</td>
            <td>${esc(r.msg || '')}</td>
            <td>${r.sticker_id ? '⌛' : ''}</td>
        </tr>
    `).join('');

    rows.forEach(async (row, index) => {
        if (row.sticker_id) {
            const stickerUrl = await getStickerUrl(row.sticker_id);
            if (stickerUrl) {
                const tableRows = tbody.querySelectorAll('tr');
                if (tableRows[index]) {
                    const stickerCell = tableRows[index].cells[4];
                    stickerCell.innerHTML = `<img src="${esc(stickerUrl)}" alt="Стикер" style="width: 40px; height: 40px;">`;
                }
            }
        }
    });
}


function initLiveFeed() {
    const liveFeedTabButton = document.querySelector('.tabs__button[data-tab="live-feed"]');
    document.getElementById('live-feed-thanks-prev-page-btn')?.addEventListener('click', () => {
        if (liveFeedPage > 1) {
            liveFeedPage--;
            const offset = (liveFeedPage - 1) * liveFeedHistoryLimit;
            loadLiveFeedHistory(liveFeedHistoryLimit, offset);
        }
    });

    document.getElementById('live-feed-thanks-next-page-btn')?.addEventListener('click', () => {
        if (liveFeedPage < liveFeedTotalPages) {
            liveFeedPage++;
            const offset = (liveFeedPage - 1) * liveFeedHistoryLimit;
            loadLiveFeedHistory(liveFeedHistoryLimit, offset);
        }
    });

    liveFeedTabButton?.addEventListener('click', () => {
        if (liveFeedHistoryRows.length === 0 && liveFeedPage === 1) {
            loadLiveFeedHistory();
        }
    });

    if (document.getElementById('live-feed')?.classList.contains('tab-content--active')) {
        loadLiveFeedHistory();
    }
}


function fmtDate(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}


function fmtDateTime(iso) {
    if (!iso) return '—';

    // For backend timestamps in the activity feed we prefer string parsing,
    // so the displayed local (Ekaterinburg-shifted) time is preserved as-is.
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
    if (m) {
        const base = `${m[3]}.${m[2]}.${m[1]}`;
        if (m[4] && m[5]) return `${base}, ${m[4]}:${m[5]}`;
        return base;
    }

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


function esc(s) {
    return String(s ?? '').replace(/[&<>\"']/g, m => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
}


let homeFeedRows = [];
let homeFeedFilter = 'all';
let homeFeedLimit = 20;
let homeFeedPage = 1;
let homeFeedTotalPages = 1;
const homeFeedPageCache = new Map();


function switchToTab(tabId) {
    const btn = document.querySelector(`.tabs__button[data-tab="${tabId}"]`);
    btn?.click();
}


function syncHomeNavSelection() {
    const activeTab = document.querySelector('.tabs__button.tabs__button--active')?.dataset.tab || 'my-page';
    document.querySelectorAll('.home-nav__item').forEach((btn) => {
        const isActive = btn.dataset.homeTarget === activeTab;
        btn.classList.toggle('home-nav__item--active', isActive);
    });
    syncMainProfileVisibility(activeTab);
    mountSharedComposer(activeTab);
}


function syncMainProfileVisibility(activeTab = null) {
    const profile = document.getElementById('user-info');
    if (!profile) return;
    const currentActiveTab = activeTab || document.querySelector('.tabs__button.tabs__button--active')?.dataset.tab || 'my-page';
    profile.hidden = !['my-page', 'game', 'shop'].includes(currentActiveTab);
}


function mountSharedComposer(activeTab = null) {
    const composer = document.getElementById('thanks-modal');
    if (!composer) return;

    const currentActiveTab = activeTab || document.querySelector('.tabs__button.tabs__button--active')?.dataset.tab || 'my-page';
    const targetSlotId = currentActiveTab === 'game' ? 'game-composer-slot' : 'home-composer-slot';
    const targetSlot = document.getElementById(targetSlotId);
    if (!targetSlot) return;

    if (composer.parentElement !== targetSlot) {
        targetSlot.appendChild(composer);
    }

    ['home-composer-slot', 'game-composer-slot'].forEach((slotId) => {
        const slot = document.getElementById(slotId);
        if (!slot) return;
        const hasComposer = slot.querySelector('#thanks-modal') !== null;
        slot.classList.toggle('shared-composer-slot--empty', !hasComposer);
    });
}


function initHomeSidebarNav() {
    document.querySelectorAll('.home-nav__item').forEach((btn) => {
        if (btn.dataset.homeNavInit === '1') return;
        btn.addEventListener('click', () => {
            const target = btn.dataset.homeTarget;
            if (target) {
                switchToTab(target);
            }
            syncHomeNavSelection();
        });
        btn.dataset.homeNavInit = '1';
    });

    document.querySelectorAll('.tabs__button').forEach((btn) => {
        if (btn.dataset.homeNavSyncInit === '1') return;
        btn.addEventListener('click', syncHomeNavSelection);
        btn.dataset.homeNavSyncInit = '1';
    });

    syncHomeNavSelection();
}


function openThanksComposerOnHome() {
    switchToTab('my-page');
    openThanksModal();
    const composer = document.getElementById('thanks-modal');
    composer?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
        document.getElementById('thanks-message')?.focus();
    }, 50);
}


async function refreshHomeComposerInfo() {
    const hint = document.getElementById('home-composer-limit');
    const submitBtn = document.querySelector('#thanks-form button[type="submit"]');
    const gameSelect = document.getElementById('thanks-game');
    if (!hint) return;

    const userId = getCurrentUserId();
    if (!userId) {
        hint.textContent = 'Нет user_id в URL';
        hint.dataset.hasValue = '0';
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    const selectedGameId = Number(gameSelect?.value || '0');
    if (!selectedGameId) {
        const hasGamesFlag = gameSelect?.dataset?.hasGames;
        if (hasGamesFlag === '1') {
            hint.textContent = 'Сначала выберите игру';
        } else if (hasGamesFlag === '0') {
            hint.textContent = 'Вы не участвуете ни в одной активной игре';
        } else {
            hint.textContent = 'Загрузка списка игр…';
        }
        hint.dataset.hasValue = '0';
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    try {
        const likesInfo = await fetchLikesInfo(userId, selectedGameId);
        if (likesInfo?.is_participant === false) {
            hint.textContent = 'Вы не участвуете в выбранной игре';
            hint.dataset.hasValue = '0';
            if (submitBtn) submitBtn.disabled = true;
            return;
        }
        if (!likesInfo.has_active_game) {
            hint.textContent = 'Сейчас нет активной игры';
            hint.dataset.hasValue = '0';
            if (submitBtn) submitBtn.disabled = true;
            return;
        }

        hint.textContent = `Можно отправить: ${likesInfo.remaining_likes ?? 0}`;
        hint.dataset.hasValue = '1';
        if (submitBtn) submitBtn.disabled = (likesInfo.remaining_likes ?? 0) <= 0;
    } catch (e) {
        console.error(e);
        hint.textContent = 'Не удалось получить лимит Спасибок';
        hint.dataset.hasValue = '0';
        if (submitBtn) submitBtn.disabled = false;
    }
}


async function renderHomeFeed(rows) {
    const container = document.getElementById('home-feed-list');
    if (!container) return;

    if (!rows || rows.length === 0) {
        container.innerHTML = '<p class="home-feed__empty">По выбранному фильтру пока нет записей.</p>';
        return;
    }

    const personHtml = (name, photoUrl) => {
        const safeName = esc(name || 'Неизвестно');
        const initial = esc((name || 'Н').trim().charAt(0).toUpperCase() || 'Н');
        return `
            <span class="home-feed-item__person">
                <span class="home-feed-item__avatar" aria-hidden="true">
                    ${photoUrl
                        ? `<img src="${esc(photoUrl)}" alt="" loading="lazy" />`
                        : `<span class="home-feed-item__avatar-fallback">${initial}</span>`}
                </span>
                <span class="home-feed-item__name">${safeName}</span>
            </span>
        `;
    };

    const rowsHtml = await Promise.all(rows.map(async (row) => {
        if (row.event_type === 'purchase') {
            const buyerName = row.buyer_name || 'Неизвестно';
            const buyerPhoto = row.buyer_photo_url || null;
            const itemName = row.item_name || 'Товар';
            const amount = Number(row.amount_spent || 0).toLocaleString('ru-RU');

            return `
                <article class="home-feed-item home-feed-item--purchase">
                    <div class="home-feed-item__meta">
                        <div class="home-feed-item__names">
                            ${personHtml(buyerName, buyerPhoto)}
                            <span class="home-feed-item__arrow">купил(а)</span>
                            <span class="home-feed-item__name">${esc(itemName)}</span>
                            <span class="home-feed-item__purchase-price">за ${amount} монет</span>
                        </div>
                        <span class="home-feed-item__date">${esc(fmtDateTime(row.date))}</span>
                    </div>
                    ${row.item_photo_url ? `
                        <div class="home-feed-item__sticker home-feed-item__purchase-photo">
                            <img src="${esc(row.item_photo_url)}" alt="${esc(itemName)}" loading="lazy" />
                        </div>
                    ` : ''}
                </article>
            `;
        }

        const stickerUrl = row.sticker_id ? await getStickerUrl(row.sticker_id) : null;
        const hasMessage = Boolean((row.msg || '').trim());

        return `
            <article class="home-feed-item">
                <div class="home-feed-item__meta">
                    <div class="home-feed-item__names">
                        ${personHtml(row.from_user_name, row.from_user_photo_url)}
                        <span class="home-feed-item__arrow">→</span>
                        ${personHtml(row.to_user_name, row.to_user_photo_url)}
                    </div>
                    <span class="home-feed-item__date">${esc(fmtDateTime(row.date))}</span>
                </div>
                ${hasMessage ? `<p class="home-feed-item__message">${esc(row.msg)}</p>` : ''}
                ${stickerUrl ? `
                    <div class="home-feed-item__sticker">
                        <img src="${esc(stickerUrl)}" alt="Стикер" loading="lazy" />
                    </div>
                ` : ''}
            </article>
        `;
    }));

    container.innerHTML = rowsHtml.join('');
}


function applyHomeFeedFilter() {
    const currentUserId = Number(getCurrentUserId() || '0');
    let rows = homeFeedRows;

    if (homeFeedFilter === 'received') {
        rows = homeFeedRows.filter((row) =>
            row.event_type !== 'purchase' && Number(row.to_user_bitrix_id || 0) === currentUserId
        );
    } else if (homeFeedFilter === 'sent') {
        rows = homeFeedRows.filter((row) =>
            row.event_type !== 'purchase' && Number(row.from_user_bitrix_id || 0) === currentUserId
        );
    }

    renderHomeFeed(rows);

    const setBtnState = (id, active) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
    };

    setBtnState('home-feed-filter-all', homeFeedFilter === 'all');
    setBtnState('home-feed-filter-received', homeFeedFilter === 'received');
    setBtnState('home-feed-filter-sent', homeFeedFilter === 'sent');
}


function updateHomeFeedPager() {
    const pager = document.getElementById('home-feed-pager');
    const prevButton = document.getElementById('home-feed-prev-page-btn');
    const nextButton = document.getElementById('home-feed-next-page-btn');
    const currentPageSpan = document.getElementById('home-feed-current-page');
    if (!pager || !prevButton || !nextButton || !currentPageSpan) return;

    currentPageSpan.textContent = `Страница ${homeFeedPage} из ${homeFeedTotalPages}`;
    prevButton.disabled = homeFeedPage <= 1;
    nextButton.disabled = homeFeedPage >= homeFeedTotalPages;
    pager.hidden = homeFeedTotalPages <= 1;
}


function setHomeFeedPagerLoading() {
    const pager = document.getElementById('home-feed-pager');
    const prevButton = document.getElementById('home-feed-prev-page-btn');
    const nextButton = document.getElementById('home-feed-next-page-btn');
    const currentPageSpan = document.getElementById('home-feed-current-page');
    if (!pager || !prevButton || !nextButton || !currentPageSpan) return;

    pager.hidden = false;
    currentPageSpan.textContent = `Страница ${homeFeedPage} из ${homeFeedTotalPages}`;
    prevButton.disabled = true;
    nextButton.disabled = true;
}


function initHomeFeedPager() {
    const prevButton = document.getElementById('home-feed-prev-page-btn');
    const nextButton = document.getElementById('home-feed-next-page-btn');

    if (prevButton && prevButton.dataset.homeFeedInit !== '1') {
        prevButton.addEventListener('click', () => {
            if (homeFeedPage <= 1) return;
            loadHomeFeed(homeFeedPage - 1);
        });
        prevButton.dataset.homeFeedInit = '1';
    }

    if (nextButton && nextButton.dataset.homeFeedInit !== '1') {
        nextButton.addEventListener('click', () => {
            if (homeFeedPage >= homeFeedTotalPages) return;
            loadHomeFeed(homeFeedPage + 1);
        });
        nextButton.dataset.homeFeedInit = '1';
    }

    updateHomeFeedPager();
}


function initHomeFeedFilters() {
    const bindings = [
        ['home-feed-filter-all', 'all'],
        ['home-feed-filter-received', 'received'],
        ['home-feed-filter-sent', 'sent'],
    ];

    bindings.forEach(([id, value]) => {
        const btn = document.getElementById(id);
        if (!btn || btn.dataset.homeFeedInit === '1') return;
        btn.addEventListener('click', () => {
            homeFeedFilter = value;
            applyHomeFeedFilter();
        });
        btn.dataset.homeFeedInit = '1';
    });
}


async function fetchHomeFeedPageData(page) {
    const requestedPage = Math.max(1, Number(page) || 1);
    const offset = (requestedPage - 1) * homeFeedLimit;
    const res = await fetch(`/api/activity/feed?limit=${homeFeedLimit}&offset=${offset}`);
    if (!res.ok) throw new Error(`Не удалось загрузить ленту (${res.status})`);
    const data = await res.json();
    return {
        rows: Array.isArray(data.events) ? data.events : [],
        totalPages: Math.max(1, Number(data.total_pages) || 1),
    };
}


async function loadHomeFeed(page = homeFeedPage, { force = false } = {}) {
    const container = document.getElementById('home-feed-list');
    if (!container) return;

    const requestedPage = Math.max(1, Number(page) || 1);
    if (force) homeFeedPageCache.clear();

    if (!force && homeFeedPageCache.has(requestedPage)) {
        homeFeedPage = requestedPage;
        homeFeedRows = homeFeedPageCache.get(requestedPage) || [];
        applyHomeFeedFilter();
        updateHomeFeedPager();
        return;
    }

    container.innerHTML = '<p class="home-feed__empty">Загрузка ленты активности…</p>';
    setHomeFeedPagerLoading();

    try {
        const firstFetch = await fetchHomeFeedPageData(requestedPage);
        homeFeedTotalPages = firstFetch.totalPages;

        let effectivePage = Math.min(requestedPage, homeFeedTotalPages);
        let pageRows = firstFetch.rows;

        if (effectivePage !== requestedPage) {
            if (homeFeedPageCache.has(effectivePage)) {
                pageRows = homeFeedPageCache.get(effectivePage) || [];
            } else {
                const correctedFetch = await fetchHomeFeedPageData(effectivePage);
                pageRows = correctedFetch.rows;
            }
        }

        homeFeedPage = effectivePage;
        homeFeedRows = pageRows;
        homeFeedPageCache.set(homeFeedPage, homeFeedRows);
        applyHomeFeedFilter();
        updateHomeFeedPager();
    } catch (e) {
        console.error(e);
        homeFeedRows = [];
        homeFeedPage = 1;
        homeFeedTotalPages = 1;
        homeFeedPageCache.clear();
        container.innerHTML = '<p class="home-feed__empty">Не удалось загрузить ленту активности.</p>';
        updateHomeFeedPager();
    }
}


function renderHomeTopThree(data) {
    const listEl = document.getElementById('home-top3-list');
    const subtitleEl = document.getElementById('home-top3-subtitle');
    if (!listEl) return;

    if (subtitleEl) {
        subtitleEl.textContent = '';
        subtitleEl.hidden = true;
    }

    if (!Array.isArray(data.leaders) || data.leaders.length === 0) {
        listEl.innerHTML = '<p class="home-top3__empty">В этом месяце пока нет Спасибок.</p>';
        return;
    }

    listEl.innerHTML = data.leaders.map((row) => `
        <article class="home-top3-item">
            <div class="home-top3-item__avatar">
                ${row.photo_url ? `<img src="${esc(row.photo_url)}" alt="${esc(row.fio)}" />` : '👤'}
            </div>
            <div>
                <p class="home-top3-item__name">${esc(row.fio)}</p>
                <p class="home-top3-item__score">Получено: ${Number(row.received || 0).toLocaleString('ru-RU')}</p>
            </div>
            <div class="home-top3-item__place">${row.place} место</div>
        </article>
    `).join('');
}


async function loadHomeTopThree() {
    const listEl = document.getElementById('home-top3-list');
    if (!listEl) return;
    listEl.innerHTML = '<p class="home-top3__empty">Загружаем рейтинг…</p>';

    try {
        const res = await fetch('/api/rating/monthly-top-active-game');
        if (!res.ok) throw new Error(`Не удалось загрузить рейтинг (${res.status})`);
        const data = await res.json();
        renderHomeTopThree(data);
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<p class="home-top3__empty">Не удалось загрузить рейтинг месяца.</p>';
    }
}


function renderCompactPurchasesList(listEl, rows) {
    if (!listEl) return;

    if (!rows || rows.length === 0) {
        listEl.innerHTML = '<p class="home-top3__empty">Покупок пока не было.</p>';
        return;
    }

    listEl.innerHTML = rows.map((row) => `
        <article class="home-purchase-item">
            <div class="home-purchase-item__thumb">
                ${row.item_photo_url ? `<img src="${esc(row.item_photo_url)}" alt="${esc(row.item_name)}" loading="lazy" />` : '🛍️'}
            </div>
            <div>
                <p class="home-purchase-item__title">${esc(row.item_name || 'Товар')}</p>
                <p class="home-purchase-item__meta">${esc(fmtDate(row.created_at))} • ${Number(row.amount_spent || 0).toLocaleString('ru-RU')} монет</p>
            </div>
        </article>
    `).join('');
}


function renderHomePurchases(rows) {
    renderCompactPurchasesList(document.getElementById('home-purchases-list'), rows);
}


function renderShopPurchases(rows) {
    renderCompactPurchasesList(document.getElementById('shop-purchases-list'), rows);
}


let compactPurchasesPage = 1;
let compactPurchasesTotalPages = 1;
const compactPurchasesPageSize = 5;


function buildSmallPages(totalPages, currentPageValue) {
    const safeTotalPages = Math.max(1, Number(totalPages) || 1);
    const safeCurrent = Math.min(Math.max(1, Number(currentPageValue) || 1), safeTotalPages);
    const maxVisible = 7;
    const pages = [];

    if (safeTotalPages <= maxVisible) {
        for (let p = 1; p <= safeTotalPages; p++) pages.push(p);
        return pages;
    }

    pages.push(1);
    let start = Math.max(2, safeCurrent - 1);
    let end = Math.min(safeTotalPages - 1, safeCurrent + 1);

    if (safeCurrent <= 3) {
        start = 2;
        end = 4;
    }
    if (safeCurrent >= safeTotalPages - 2) {
        start = safeTotalPages - 3;
        end = safeTotalPages - 1;
    }

    if (start > 2) pages.push('…');
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < safeTotalPages - 1) pages.push('…');
    pages.push(safeTotalPages);
    return pages;
}


function renderCompactPurchasesPages() {
    const roots = [
        document.getElementById('home-purchases-pages'),
        document.getElementById('shop-purchases-pages'),
    ];

    const safeTotalPages = Math.max(1, Number(compactPurchasesTotalPages) || 1);
    const safeCurrent = Math.min(Math.max(1, Number(compactPurchasesPage) || 1), safeTotalPages);
    const pages = buildSmallPages(safeTotalPages, safeCurrent);

    roots.forEach((root) => {
        if (!root) return;
        if (safeTotalPages <= 1) {
            root.hidden = true;
            root.innerHTML = '';
            return;
        }

        root.hidden = false;
        root.innerHTML = pages.map((p) => {
            if (p === '…') {
                return '<span class="games-pages__ellipsis" aria-hidden="true">…</span>';
            }
            const page = Number(p);
            const activeClass = page === safeCurrent ? ' games-pages__btn--active' : '';
            return `<button type="button" class="games-pages__btn${activeClass}" data-page="${page}" aria-label="Страница ${page}" aria-current="${page === safeCurrent ? 'page' : 'false'}">${page}</button>`;
        }).join('');
    });
}


function setCompactPurchasesPaginationLoading() {
    ['home-purchases-pages', 'shop-purchases-pages'].forEach((id) => {
        const root = document.getElementById(id);
        if (!root) return;
        root.hidden = true;
    });
}


function initCompactPurchasesPagination() {
    ['home-purchases-pages', 'shop-purchases-pages'].forEach((id) => {
        const root = document.getElementById(id);
        if (!root || root.dataset.init === '1') return;

        root.addEventListener('click', (event) => {
            const btn = event.target.closest('.games-pages__btn[data-page]');
            if (!btn) return;

            const page = Number(btn.dataset.page || '1');
            if (!Number.isFinite(page) || page < 1 || page === compactPurchasesPage) return;
            loadHomePurchases(page);
        });

        root.dataset.init = '1';
    });
}


async function loadHomePurchases(page = compactPurchasesPage) {
    const userId = getCurrentUserId();
    if (!userId) return;
    const requestedPage = Math.max(1, Number(page) || 1);

    const homeListEl = document.getElementById('home-purchases-list');
    const shopListEl = document.getElementById('shop-purchases-list');
    if (homeListEl) homeListEl.innerHTML = '<p class="home-top3__empty">Загрузка покупок…</p>';
    if (shopListEl) shopListEl.innerHTML = '<p class="home-top3__empty">Загрузка покупок…</p>';
    setCompactPurchasesPaginationLoading();

    try {
        const res = await fetch(`/api/user/${encodeURIComponent(userId)}/purchases?page=${requestedPage}&limit=${compactPurchasesPageSize}`);
        if (!res.ok) throw new Error(`Не удалось загрузить покупки (${res.status})`);
        const data = await res.json();
        const rows = data.purchases || [];
        compactPurchasesTotalPages = Math.max(1, Number(data.total_pages) || 1);
        compactPurchasesPage = Math.min(Math.max(1, Number(data.page) || requestedPage), compactPurchasesTotalPages);
        renderHomePurchases(rows);
        renderShopPurchases(rows);
        renderCompactPurchasesPages();
    } catch (e) {
        console.error(e);
        if (homeListEl) homeListEl.innerHTML = '<p class="home-top3__empty">Не удалось загрузить покупки.</p>';
        if (shopListEl) shopListEl.innerHTML = '<p class="home-top3__empty">Не удалось загрузить покупки.</p>';
        compactPurchasesTotalPages = 1;
        renderCompactPurchasesPages();
    }
}


async function loadHomeDashboardData() {
    await Promise.allSettled([
        refreshHomeComposerInfo(),
        loadHomeFeed(1, { force: true }),
        loadHomeTopThree(),
        loadHomePurchases(),
    ]);
}


let gamesLoaded = false;
let currentActiveGames = [];
let finishedGames = [];
let currentPage = 1;
const itemsPerPage = 5;
let activeGamesRenderNonce = 0;


function isUserInGameParticipants(game, userId) {
    if (!game || !Array.isArray(game.participant_ids) || !userId) return false;
    return game.participant_ids.map((id) => String(id)).includes(String(userId));
}


function updatePagination(totalPages) {
    const safeTotalPages = Math.max(1, Number(totalPages) || 1);
    const prevButton = document.getElementById('prev-page-btn');
    const nextButton = document.getElementById('next-page-btn');
    const currentPageSpan = document.getElementById('current-page');

    if (currentPage > safeTotalPages) currentPage = safeTotalPages;
    if (currentPage < 1) currentPage = 1;

    if (currentPageSpan) currentPageSpan.textContent = `Страница ${currentPage}`;
    if (prevButton) prevButton.disabled = currentPage === 1;
    if (nextButton) nextButton.disabled = currentPage === safeTotalPages;

    renderFinishedGamesPages(safeTotalPages);
}


function renderFinishedGamesPages(totalPages) {
    const root = document.getElementById('finished-games-pages');
    if (!root) return;

    const safeTotalPages = Math.max(1, Number(totalPages) || 1);
    if (safeTotalPages <= 1) {
        root.hidden = true;
        root.innerHTML = '';
        return;
    }

    const maxVisible = 7;
    const pages = [];

    if (safeTotalPages <= maxVisible) {
        for (let p = 1; p <= safeTotalPages; p++) pages.push(p);
    } else {
        pages.push(1);
        let start = Math.max(2, currentPage - 1);
        let end = Math.min(safeTotalPages - 1, currentPage + 1);

        if (currentPage <= 3) {
            start = 2;
            end = 4;
        }
        if (currentPage >= safeTotalPages - 2) {
            start = safeTotalPages - 3;
            end = safeTotalPages - 1;
        }

        if (start > 2) pages.push('…');
        for (let p = start; p <= end; p++) pages.push(p);
        if (end < safeTotalPages - 1) pages.push('…');
        pages.push(safeTotalPages);
    }

    root.hidden = false;
    root.innerHTML = pages.map((p) => {
        if (p === '…') {
            return '<span class="games-pages__ellipsis" aria-hidden="true">…</span>';
        }
        const page = Number(p);
        const activeClass = page === currentPage ? ' games-pages__btn--active' : '';
        return `<button type="button" class="games-pages__btn${activeClass}" data-page="${page}" aria-label="Страница ${page}" aria-current="${page === currentPage ? 'page' : 'false'}">${page}</button>`;
    }).join('');
}


async function loadGames() {
    try {
        const allRes = await fetch('/api/games/all');
        if (!allRes.ok) throw new Error(`Не удалось загрузить список игр (${allRes.status})`);

        const allGames = await allRes.json();
        const games = Array.isArray(allGames) ? allGames : [];

        const activeRows = games
            .filter((g) => g && g.game_is_active)
            .sort((a, b) => {
                const aTs = new Date(a.game_end || a.game_start || 0).getTime();
                const bTs = new Date(b.game_end || b.game_start || 0).getTime();
                return aTs - bTs;
            });
        currentActiveGames = activeRows;

        const now = Date.now();
        const completedGames = games
            .filter((g) => {
                if (!g || g.game_is_active) return false;
                if (!g.game_end) return false;
                const endTs = new Date(g.game_end).getTime();
                return Number.isFinite(endTs) && endTs < now;
            })
            .sort((a, b) => new Date(b.game_end).getTime() - new Date(a.game_end).getTime());

        const totalPages = Math.max(1, Math.ceil(completedGames.length / itemsPerPage));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const offset = (currentPage - 1) * itemsPerPage;
        finishedGames = completedGames.slice(offset, offset + itemsPerPage);

        await renderActiveGame(activeRows);
        renderFinishedGames(finishedGames);

        updatePagination(totalPages);
    } catch (e) {
        console.error(e);
        toast(e.message || 'Ошибка загрузки игр');
        currentActiveGames = [];
        await renderActiveGame([]);
        renderFinishedGames([]);
        updatePagination(1);
    }
}


function openGameModalForGame(game, { isActive = false } = {}) {
    if (!game) return;
    const modal = document.getElementById('game-modal');
    if (!modal) return;

    const titleEl = modal.querySelector('#game-modal-title');
    if (titleEl) {
        titleEl.textContent = isActive ? 'Активная игра' : 'Завершённая игра';
    }

    modal.querySelector('#game-modal-name').textContent        = game.name || '—';
    modal.querySelector('#game-modal-description').textContent = game.description || '—';
    modal.querySelector('#game-modal-start').textContent       = fmtDate(game.game_start);
    modal.querySelector('#game-modal-end').textContent         = fmtDate(game.game_end);

    const rulesEl = modal.querySelector('#game-modal-rule');
    if (rulesEl) {
        rulesEl.textContent = formatGameRules(game);
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');

    loadGameRatingById(game.id);
}


function formatGameRules(game) {
    if (!game) return '—';
    const paramLabel = {
        day: 'в день',
        week: 'в неделю',
        month: 'в месяц',
        game: 'за всю игру',
    }[game.setting_limitParameter] || '';
    const total = game.setting_limitValue;
    const perUser = game.setting_limitToOneUser;
    const parts = [];
    if (total != null && paramLabel) {
        parts.push(`Вы можете отправить не более ${total} Спасибок ${paramLabel}`);
    }
    if (perUser != null) {
        parts.push(`и не более ${perUser} Спасибок одному и тому же человеку`);
    }
    return parts.length ? parts.join(', ') : 'Правила еще не заданы';
}


function closeGameModal() {
    const modal = document.getElementById('game-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
}


async function refreshGameLikesInfo() {
    if (!Array.isArray(currentActiveGames) || !currentActiveGames.length) return;
    await renderActiveGame(currentActiveGames);
}


async function renderActiveGame(rows) {
    const listEl = document.getElementById('active-games-list');
    const empty = document.getElementById('active-game-empty');
    const block = document.getElementById('active-game-block');

    if (!listEl || !empty) return;

    if (!rows || !rows.length) {
        currentActiveGames = [];
        activeGamesRenderNonce += 1;
        if (block) block.classList.add('games-active--empty');
        listEl.hidden = true;
        listEl.innerHTML = '';
        empty.hidden = false;
        return;
    }

    currentActiveGames = rows.slice();
    const userId = getCurrentUserId();
    const renderNonce = ++activeGamesRenderNonce;
    if (block) block.classList.remove('games-active--empty');

    listEl.hidden = false;
    listEl.innerHTML = rows.map((game) => `
        <article class="games-active__item" data-active-game-id="${game.id}">
            <div class="games-active__item-main">
                <div class="games-active__item-copy">
                    <a href="#" class="games-active__item-link" data-active-game-id="${game.id}">
                        ${esc(game.name || 'Без названия')}
                    </a>
                    <p class="games-active__item-dates">${fmtDate(game.game_start)} — ${fmtDate(game.game_end)}</p>
                </div>
                <div class="games-active__item-stats" data-active-game-stats="${game.id}">
                    <div class="games-active__stat">
                        <span class="games-active__stat-label">Получено</span>
                        <span class="games-active__stat-value"><span data-stat="received">…</span></span>
                    </div>
                    <div class="games-active__stat">
                        <span class="games-active__stat-label">Можно отправить</span>
                        <span class="games-active__stat-value"><span data-stat="remaining">…</span></span>
                    </div>
                    <div class="games-active__stat">
                        <span class="games-active__stat-label">Отправлено</span>
                        <span class="games-active__stat-value"><span data-stat="sent">…</span></span>
                    </div>
                </div>
            </div>
            <p class="games-active__item-note" data-active-game-note="${game.id}" hidden></p>
        </article>
    `).join('');
    empty.hidden = true;

    const setItemStats = (gameId, { received = '—', remaining = '—', sent = '—', note = '' } = {}) => {
        const statsRoot = listEl.querySelector(`[data-active-game-stats="${gameId}"]`);
        if (!statsRoot) return;

        const receivedEl = statsRoot.querySelector('[data-stat="received"]');
        const remainingEl = statsRoot.querySelector('[data-stat="remaining"]');
        const sentEl = statsRoot.querySelector('[data-stat="sent"]');
        if (receivedEl) receivedEl.textContent = String(received);
        if (remainingEl) remainingEl.textContent = String(remaining);
        if (sentEl) sentEl.textContent = String(sent);

        const noteEl = listEl.querySelector(`[data-active-game-note="${gameId}"]`);
        if (!noteEl) return;
        if (note) {
            noteEl.textContent = note;
            noteEl.hidden = false;
        } else {
            noteEl.hidden = true;
            noteEl.textContent = '';
        }
    };

    if (!userId) {
        rows.forEach((game) => setItemStats(game.id, { received: '—', remaining: '—', sent: '—' }));
        return;
    }

    await Promise.allSettled(rows.map(async (game) => {
        if (renderNonce !== activeGamesRenderNonce) return;

        if (!isUserInGameParticipants(game, userId)) {
            setItemStats(game.id, {
                received: '—',
                remaining: '—',
                sent: '—',
                note: 'Вы не участвуете в этой игре',
            });
            return;
        }

        try {
            const likesInfo = await fetchLikesInfo(userId, game.id);
            if (renderNonce !== activeGamesRenderNonce) return;

            if (likesInfo?.is_participant === false) {
                setItemStats(game.id, {
                    received: '—',
                    remaining: '—',
                    sent: '—',
                    note: 'Вы не участвуете в этой игре',
                });
                return;
            }

            setItemStats(game.id, {
                received: Number(likesInfo.received_likes ?? 0).toLocaleString('ru-RU'),
                remaining: Number(likesInfo.remaining_likes ?? 0).toLocaleString('ru-RU'),
                sent: Number(likesInfo.sent_likes ?? 0).toLocaleString('ru-RU'),
            });
        } catch (e) {
            if (renderNonce !== activeGamesRenderNonce) return;
            console.error(e);
            setItemStats(game.id, {
                received: '—',
                remaining: '—',
                sent: '—',
            });
        }
    }));
}


async function loadGameRating() {
    const root = document.getElementById('game-modal-rating');
    if (!root) return;
    root.innerHTML = '<p class="game-rating__loading">Загружаем рейтинг…</p>';
    try {
        const res = await fetch('/api/games/active/rating');
        if (!res.ok) {
            throw new Error(`Не удалось загрузить рейтинг (${res.status})`);
        }
        const rows = await res.json();
        renderGameRating(rows);
    } catch (e) {
        console.error(e);
        root.innerHTML = '<p class="game-rating__error">Ошибка загрузки рейтинга</p>';
    }
}


async function loadGameRatingById(gameId) {
    const root = document.getElementById('game-modal-rating');
    if (!root) return;

    root.innerHTML = '<p class="game-rating__loading">Загружаем рейтинг…</p>';
    try {
        const res = await fetch(`/api/games/${gameId}/rating`);
        if (!res.ok) {
            let msg = 'Ошибка загрузки рейтинга';
            try {
                const data = await res.json();
                if (data?.detail) msg = data.detail;
            } catch (_) {}
            root.innerHTML = `<p class="game-rating__error">${msg}</p>`;
            return;
        }

        const rows = await res.json();
        renderGameRating(rows);
    } catch (e) {
        console.error(e);
        root.innerHTML = '<p class="game-rating__error">Ошибка загрузки рейтинга</p>';
    }
}


function renderGameRating(rows, containerId = 'game-modal-rating') {
    const root = document.getElementById(containerId);
    if (!root) return;

    const isOverall = containerId === 'overall-rating-container';

    const emptyMessage = isOverall
        ? 'В общем рейтинге ещё нет Спасибок'
        : 'В этой игре ещё нет Спасибок';

    // Пустое состояние
    if (!rows || !rows.length) {
        if (isOverall) {
            // Для блока "Общий рейтинг" — оформляем как таблицу, чтобы
            // текст выглядел так же, как в "Завершённых играх"
            root.innerHTML = `
                <div class="table-wrap">
                    <table class="table">
                        <tbody>
                            <tr>
                                <td class="table__empty" colspan="4">${emptyMessage}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            // Для рейтинга в модалке (и других контейнеров) оставляем компактный вариант
            root.innerHTML = `<p class="game-rating__empty">${emptyMessage}</p>`;
        }
        return;
    }

    // Непустой рейтинг — как и было
    const header = `
        <div class="game-rating__header">
            <span class="game-rating__col game-rating__col--index">№</span>
            <span class="game-rating__col game-rating__col--name">Сотрудник</span>
            <span class="game-rating__col game-rating__col--received">Получено</span>
            <span class="game-rating__col game-rating__col--sent">Отправлено</span>
        </div>
    `;

    const items = rows.map((row, idx) => {
        const fio = row.fio || '—';
        const avatarHtml = row.photo_url
            ? `<span class="game-rating__avatar"><img src="${row.photo_url}" alt=""></span>`
            : '';

        return `
            <li class="game-rating__item">
                <span class="game-rating__index">${idx + 1}</span>
                <span class="game-rating__name">
                    ${avatarHtml}
                    <span class="game-rating__fio">${esc(fio)}</span>
                </span>
                <span class="game-rating__badge game-rating__badge--received">${row.received}</span>
                <span class="game-rating__badge game-rating__badge--sent">${row.sent}</span>
            </li>
        `;
    }).join('');

    root.innerHTML = `
        ${header}
        <ol class="game-rating__list">
            ${items}
        </ol>
    `;
}


let overallRatingPage = 1;
const overallRatingLimit = 10;
let overallRatingTotalPages = 1;


async function loadOverallRating(page = overallRatingPage) {
    const containerId = 'overall-rating-container';
    const root = document.getElementById(containerId);

    const prevBtn = document.getElementById('overall-rating-prev-btn');
    const nextBtn = document.getElementById('overall-rating-next-btn');
    const pageSpan = document.getElementById('overall-rating-current-page');

    if (!root || !prevBtn || !nextBtn || !pageSpan) return;

    overallRatingPage = Math.max(1, Number(page) || 1);

    root.innerHTML = '<p class="game-rating__loading">Загружаем общий рейтинг…</p>';

    try {
        const res = await fetch(
            `/api/rating/overall?page=${overallRatingPage}&limit=${overallRatingLimit}`
        );

        if (!res.ok) {
            throw new Error(`Не удалось загрузить общий рейтинг (${res.status})`);
        }

        const data = await res.json();
        const rows = Array.isArray(data.rating) ? data.rating : [];
        overallRatingTotalPages = Math.max(1, Number(data.total_pages) || 1);
        if (overallRatingPage > overallRatingTotalPages) {
            overallRatingPage = overallRatingTotalPages;
        }

        renderGameRating(rows, containerId);

        pageSpan.textContent = `Страница ${overallRatingPage}`;

        prevBtn.disabled = overallRatingPage <= 1;
        nextBtn.disabled = overallRatingPage >= overallRatingTotalPages;

    } catch (e) {
        console.error(e);
        root.innerHTML = '<p class="game-rating__error">Ошибка загрузки общего рейтинга</p>';

        pageSpan.textContent = 'Страница —';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
    }
}


function renderFinishedGames(rows) {
    const archiveList = document.getElementById('games-archive-list');

    if (archiveList) {
        if (!rows || !rows.length) {
            archiveList.innerHTML = '<p class="home-feed__empty">Завершённых игр пока нет.</p>';
        } else {
            archiveList.innerHTML = rows.map((g) => `
                <article class="games-archive__item">
                    <button type="button" class="games-archive__open" data-game-id="${g.id}" aria-label="Открыть игру ${esc(g.name ?? 'Без названия')}">
                        <span class="games-archive__thumb" aria-hidden="true">❤</span>
                        <span class="games-archive__content">
                            <span class="games-archive__name">${esc(g.name ?? 'Без названия')}</span>
                            <span class="games-archive__dates">${esc(fmtDate(g.game_start))} — ${esc(fmtDate(g.game_end))}</span>
                        </span>
                    </button>
                </article>
            `).join('');

            archiveList.querySelectorAll('.games-archive__open').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = Number(btn.dataset.gameId);
                    const game = finishedGames.find((item) => item.id === id);
                    if (!game) return;
                    openGameModalForGame(game, { isActive: false });
                });
            });
        }
    }

    const table = document.getElementById('finished-games');
    if (!table) return;
    let tbody = table.querySelector('tbody');
    if (!tbody) {
        tbody = document.createElement('tbody');
        table.appendChild(tbody);
    }
    if (!rows || !rows.length) {
        tbody.innerHTML = `<tr><td class="table__empty" colspan="4">Ещё нет завершённых игр</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map((g, idx) => `
        <tr>
            <td>
                <a href="#"
                   class="finished-game-link"
                   data-game-id="${g.id}">
                   ${esc(g.name ?? '—')}
                </a>
            </td>
            <td>${esc(g.description ?? '—')}</td>
            <td>${esc(fmtDate(g.game_start))}</td>
            <td>${esc(fmtDate(g.game_end))}</td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.finished-game-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const id = Number(link.dataset.gameId);
            const game = finishedGames.find(g => g.id === id);
            if (!game) return;
            openGameModalForGame(game, { isActive: false });
        });
    });
}


let shopLoaded = false;
let shopItems = [];


function renderShopItems(items) {
    const root = document.getElementById('shop-items');
    if (!root) return;

    if (!items || !items.length) {
        root.innerHTML = '<p class="shop-empty">Нет доступных товаров</p>';
        return;
    }

    root.innerHTML = items.map(item => {
        const price = Number(item.price ?? 0).toLocaleString('ru-RU');
        const stock = Number(item.stock ?? 0);
        return `
        <article class="shop-card" data-item-id="${item.id}">
            <div class="shop-card__media">
                ${
                    item.photo_url
                        ? `<img
                                src="${esc(item.photo_url)}"
                                alt="${esc(item.name ?? 'Товар')}"
                                class="shop-card__image"
                           >`
                        : `<div class="shop-card__image-placeholder" aria-hidden="true">🎁</div>`
                }
            </div>
            <div class="shop-card__info">
                <h3 class="shop-card__title">${esc(item.name ?? 'Без названия')}</h3>
                <p
                    class="shop-card__description"
                    role="button"
                    tabindex="0"
                    aria-expanded="false"
                    title="Нажмите, чтобы развернуть описание"
                >
                    ${esc(item.description || 'Без описания')}
                </p>
                <p class="shop-card__price">
                    Цена: ${price} монет
                </p>
                <p class="shop-card__stock">
                    Осталось ${stock} шт.
                </p>
                <button
                    class="btn btn--primary btn--tiny shop-card__buy"
                    type="button"
                    data-item-id="${item.id}"
                    data-item-price="${item.price}"
                    data-item-name="${esc(item.name ?? 'Товар')}"
                    ${stock <= 0 ? 'disabled' : ''}
                >
                    Купить за ${price}
                </button>
            </div>
        </article>
    `;
    }).join('');
}


async function loadShopItems() {
    const root = document.getElementById('shop-items');
    if (!root) return;

    root.innerHTML = '<p class="shop-empty">Загружаем товары…</p>';

    try {
        const res = await fetch('/api/show-items');
        if (!res.ok) {
            let msg = `Не удалось загрузить товары (${res.status})`;
            try {
                const data = await res.json();
                if (data?.detail) msg = data.detail;
            } catch (_) {}
            throw new Error(msg);
        }
        const items = await res.json();
        renderShopItems(items);
    } catch (e) {
        console.error(e);
        toast(e.message || 'Ошибка загрузки товаров');
        root.innerHTML = '<p class="shop-empty">Не удалось загрузить товары</p>';
    }
}


function initShopImageModal() {
    const modal = document.getElementById('shop-image-modal');
    const modalImg = document.getElementById('shop-image-modal-img');
    const closeBtn = document.getElementById('shop-image-modal-close');
    const overlay = modal?.querySelector('.modal__overlay');
    const shopRoot = document.getElementById('shop-items');

    if (!modal || !modalImg || !shopRoot) return;

    const open = (src, alt) => {
        modalImg.src = src;
        modalImg.alt = alt || '';
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
    };

    const close = () => {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        modalImg.removeAttribute('src');
        modalImg.alt = '';
    };

    shopRoot.addEventListener('click', (e) => {
        const img = e.target.closest('.shop-card__image');
        if (!img) return;

        e.preventDefault();
        open(img.src, img.alt || '');
    });

    closeBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) {
            close();
        }
    });
}


function askPurchaseConfirm(itemName, priceText, button = null) {
    const modal = document.getElementById('purchase-confirm-modal');
    const messageEl = document.getElementById('purchase-confirm-message');
    const okBtn = document.getElementById('purchase-confirm-ok');
    const cancelBtn = document.getElementById('purchase-confirm-cancel');
    const closeBtn = document.getElementById('purchase-confirm-close');
    const overlay = modal?.querySelector('.modal__overlay');

    if (!modal || !messageEl || !okBtn || !cancelBtn || !closeBtn || !overlay) {
        if (!button) {
            return Promise.resolve(false);
        }
        // Fallback for cached/old HTML without confirm modal:
        // require second click within 5 seconds.
        const now = Date.now();
        const confirmUntil = Number(button.dataset.confirmUntil || 0);
        if (confirmUntil > now) {
            const originalLabel = button.dataset.originalBuyLabel || button.textContent || 'Купить';
            delete button.dataset.confirmUntil;
            delete button.dataset.confirmToken;
            button.textContent = originalLabel;
            return Promise.resolve(true);
        }

        const originalLabel = button.textContent || 'Купить';
        const token = String(now);
        button.dataset.originalBuyLabel = originalLabel;
        button.dataset.confirmUntil = String(now + 5000);
        button.dataset.confirmToken = token;
        button.textContent = 'Подтвердить';
        toast('Подтвердите покупку повторным нажатием');

        setTimeout(() => {
            if (button.dataset.confirmToken !== token) return;
            delete button.dataset.confirmUntil;
            delete button.dataset.confirmToken;
            button.textContent = button.dataset.originalBuyLabel || originalLabel;
        }, 5200);

        return Promise.resolve(false);
    }

    messageEl.textContent = `Купить «${itemName}» за ${priceText} монет?`;

    return new Promise((resolve) => {
        let finished = false;

        const done = (result) => {
            if (finished) return;
            finished = true;
            cleanup();
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            resolve(result);
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                done(false);
            }
        };

        const onOk = (event) => {
            event.preventDefault();
            done(true);
        };

        const onCancel = (event) => {
            event.preventDefault();
            done(false);
        };

        const cleanup = () => {
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKeyDown);
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKeyDown);

        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        okBtn.focus();
    });
}


async function handlePurchase(button) {
    const itemId = button.getAttribute('data-item-id');
    const itemPriceRaw = button.getAttribute('data-item-price');
    const itemName = button.getAttribute('data-item-name') || 'товар';

    const buyerId = getCurrentUserId();
    if (!buyerId) {
        toast('Нет user_id в URL');
        return;
    }

    const itemPrice = parseInt(itemPriceRaw ?? '0', 10);
    if (!itemId || !itemPrice) {
        toast('Некорректные данные товара');
        return;
    }

    const priceText = Number(itemPrice || 0).toLocaleString('ru-RU');
    const isConfirmed = await askPurchaseConfirm(itemName, priceText, button);
    if (!isConfirmed) {
        return;
    }

    let disableAfter = false;

    try {
        button.disabled = true;
        button.textContent = 'Покупка...';

        const response = await fetch('/api/buy-item', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                buyer_id: buyerId,
                item_id: parseInt(itemId),
                amount_spent: itemPrice
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Ошибка покупки');
        }

        await response.json();
        toast('Товар успешно куплен!');
        await loadPurchasesHistory();
        await loadShopItems();
        await loadCurrentUser();
        const card = button.closest('.shop-card');
        if (card) {
            const stockEl = card.querySelector('.shop-card__stock');
            if (stockEl) {
                const match = stockEl.textContent.match(/\d+/);
                const currentStock = match ? parseInt(match[0], 10) : 0;
                const newStock = Math.max(currentStock - 1, 0);
                stockEl.textContent = `Остаток: ${newStock}`;
                if (newStock <= 0) {
                    disableAfter = true;
                }
            }
        }

    } catch (error) {
        toast(`Ошибка: ${error.message}`);
        console.error('Ошибка покупки:', error);
    } finally {
        if (disableAfter) {
            button.disabled = true;
            button.textContent = 'Нет в наличии';
        } else {
            button.disabled = false;
            button.textContent = 'Купить';
        }
    }
}


let settingsGamesLoaded = false;
let settingsGames = [];
let currentEditingGameId = null;
let gameParticipantCandidates = [];
let gameParticipantCandidatesLoaded = false;


function normalizeParticipantSearch(value) {
    return String(value ?? '')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .trim();
}


async function loadGameParticipantCandidates() {
    if (gameParticipantCandidatesLoaded) {
        return gameParticipantCandidates;
    }

    const res = await fetch('/api/users?only_gamers=true');
    if (!res.ok) {
        throw new Error(`Не удалось загрузить сотрудников для игры (${res.status})`);
    }
    const data = await res.json();
    gameParticipantCandidates = (Array.isArray(data) ? data : [])
        .slice()
        .sort((a, b) => {
            const aName = `${a.lastname || ''} ${a.name || ''}`.trim().toLowerCase();
            const bName = `${b.lastname || ''} ${b.name || ''}`.trim().toLowerCase();
            return aName.localeCompare(bName, 'ru');
        });
    gameParticipantCandidatesLoaded = true;
    return gameParticipantCandidates;
}


function getGameParticipantsPickerElements(prefix) {
    return {
        search: document.getElementById(`${prefix}-participants-search`),
        list: document.getElementById(`${prefix}-participants-list`),
        selectAllBtn: document.getElementById(`${prefix}-participants-select-all`),
        clearBtn: document.getElementById(`${prefix}-participants-clear`),
    };
}


function ensureGameParticipantsPickerState(prefix) {
    const { list } = getGameParticipantsPickerElements(prefix);
    if (!list) return null;
    if (!(list._selectedIds instanceof Set)) {
        list._selectedIds = new Set();
    }
    return list;
}


function setGameParticipantsPickerSelection(prefix, ids = []) {
    const list = ensureGameParticipantsPickerState(prefix);
    if (!list) return;
    list._selectedIds = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)));
}


function getGameParticipantsPickerSelection(prefix) {
    const list = ensureGameParticipantsPickerState(prefix);
    if (!list) return [];
    return [...list._selectedIds]
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
}


function renderGameParticipantsPicker(prefix) {
    const { search, list } = getGameParticipantsPickerElements(prefix);
    if (!list) return;
    ensureGameParticipantsPickerState(prefix);

    const selectedIds = list._selectedIds;
    const query = normalizeParticipantSearch(search?.value || '');
    const rows = gameParticipantCandidates.filter((u) => {
        if (!query) return true;
        const fullName = [u.name, u.lastname].filter(Boolean).join(' ');
        const haystack = normalizeParticipantSearch([fullName, u.email, u.position, u.bitrix_id].filter(Boolean).join(' '));
        return haystack.includes(query);
    });

    if (!rows.length) {
        list.innerHTML = '<p class="game-participants-picker__empty">Сотрудники не найдены.</p>';
        return;
    }

    list.innerHTML = rows.map((u) => {
        const fullName = [u.name, u.lastname].filter(Boolean).join(' ') || '—';
        const checked = selectedIds.has(String(u.bitrix_id)) ? ' checked' : '';
        const initial = esc((fullName.trim().charAt(0) || 'С').toUpperCase());
        return `
            <label class="game-participants-picker__item" data-employee-id="${u.bitrix_id}">
                <input type="checkbox" value="${u.bitrix_id}"${checked}>
                <span class="game-participants-picker__avatar" aria-hidden="true">
                    ${u.photo_url ? `<img src="${esc(u.photo_url)}" alt="">` : initial}
                </span>
                <span class="game-participants-picker__name" title="${esc(fullName)}">${esc(fullName)}</span>
            </label>
        `;
    }).join('');
}


function initGameParticipantsPicker(prefix) {
    const { search, list, selectAllBtn, clearBtn } = getGameParticipantsPickerElements(prefix);
    if (!list) return;
    ensureGameParticipantsPickerState(prefix);

    if (list.dataset.init === '1') return;

    search?.addEventListener('input', () => {
        renderGameParticipantsPicker(prefix);
    });

    list.addEventListener('change', (event) => {
        const checkbox = event.target.closest('input[type="checkbox"]');
        if (!checkbox) return;
        const selectedIds = list._selectedIds || new Set();
        const id = String(checkbox.value || '');
        if (checkbox.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        list._selectedIds = selectedIds;
    });

    selectAllBtn?.addEventListener('click', () => {
        list._selectedIds = new Set(gameParticipantCandidates.map((u) => String(u.bitrix_id)));
        renderGameParticipantsPicker(prefix);
    });

    clearBtn?.addEventListener('click', () => {
        list._selectedIds = new Set();
        renderGameParticipantsPicker(prefix);
    });

    list.dataset.init = '1';
}


async function loadSettingsGames() {
    if (settingsGamesLoaded && settingsGames.length) {
        return settingsGames;
    }

    try {
        const res = await fetch('/api/games/all');
        if (!res.ok) {
            throw new Error(`Не удалось получить список игр (${res.status})`);
        }
        const data = await res.json();
        settingsGames = data;
        settingsGamesLoaded = true;
        console.log(data)
        return data;
    } catch (e) {
        console.error(e);
        toast(e.message || 'Ошибка при загрузке игр');
        settingsGamesLoaded = false;
        settingsGames = [];
        throw e;
    }
}


async function reloadSettingsGames() {
    settingsGamesLoaded = false;
    const games = await loadSettingsGames();
    renderSettingsGames(games);
}


function renderSettingsGames(games) {
    const body = document.querySelector('#settings #settings-body');
    if (!body) return;

    if (!games || !games.length) {
        body.innerHTML = '<p class="placeholder">Игр еще нет</p>';
        return;
    }

    const rows = games.map((g) => `
        <tr>
            <td>${esc(g.name ?? '—')}</td>
            <td>${esc(g.description ?? '—')}</td>
            <td>${esc(fmtDate(g.game_start))}</td>
            <td>${esc(fmtDate(g.game_end))}</td>
            <td>
              <button
                    type="button"
                    class="settings-game-edit-btn icon-btn icon-btn--edit"
                    data-game-id="${g.id}"
                    aria-label="Редактировать игру «${esc(g.name ?? '')}»"
                >
                    <span class="icon-btn__emoji" aria-hidden="true">✏️</span>
                </button>
                <button
                    type="button"
                    class="settings-game-delete-btn icon-btn icon-btn--delete"
                    data-game-id="${g.id}"
                    title="Удалить игру"
                  >
                    <span class="icon-btn__emoji" aria-hidden="true">❌</span>
                </button>
            </td>
        </tr>
    `).join('');

    body.innerHTML = `
        <div class="table-wrap">
            <table class="table">
                <thead>
                    <tr>
                        <th>Название</th>
                        <th>Описание</th>
                        <th>Дата начала</th>
                        <th>Дата завершения</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}


function initSettingsNav() {
    const sidebar = document.querySelector('#settings .settings-sidebar');
    const settingsContent = document.querySelector('#settings .settings-content');
    if (!sidebar || !settingsContent) return;

    const titleEl = settingsContent.querySelector('#settings-section-title');
    const bodyEl = settingsContent.querySelector('#settings-body');
    const createGameBtn = settingsContent.querySelector('#create-game-btn');
    const createShopBtn = settingsContent.querySelector('#create-shop-item-btn');
    const updateEmployeesBtn = settingsContent.querySelector('#update-employees-btn');
    const showStickerCreateModalBtn = settingsContent.querySelector('#show-sticker-create-modal');

    if (!bodyEl) return;

    sidebar.addEventListener('click', async (event) => {
        const btn = event.target.closest('.settings-nav__button');
        if (!btn) return;

        sidebar.querySelectorAll('.settings-nav__button').forEach((b) => {
            b.classList.toggle('settings-nav__button--active', b === btn);
        });

        const section = btn.dataset.settingsSection;

        if (section === 'game') {
            if (titleEl) titleEl.textContent = 'Список игр';
            if (createGameBtn) createGameBtn.hidden = false;
            if (createShopBtn) createShopBtn.hidden = true;
            if (updateEmployeesBtn) updateEmployeesBtn.hidden = true;
            if (showStickerCreateModalBtn) showStickerCreateModalBtn.hidden = true;

            bodyEl.innerHTML = '<p class="placeholder">Загружаем список игр…</p>';
            try {
                const games = await loadSettingsGames();
                renderSettingsGames(games);
            } catch (_) {
                bodyEl.innerHTML = '<p class="placeholder">Не удалось загрузить игры</p>';
            }

        } else if (section === 'shop') {
            if (titleEl) titleEl.textContent = 'Список товаров';
            if (createGameBtn) createGameBtn.hidden = true;
            if (createShopBtn) createShopBtn.hidden = false;
            if (updateEmployeesBtn) updateEmployeesBtn.hidden = true;
            if (showStickerCreateModalBtn) showStickerCreateModalBtn.hidden = true;

            bodyEl.innerHTML = '<p class="placeholder">Загружаем список товаров…</p>';

            try {
                const items = await loadSettingsItems();
                renderSettingsItems(items);
            } catch (err) {
                bodyEl.innerHTML = '<p class="placeholder">Не удалось загрузить товары магазина</p>';
            }

        } else if (section === 'employees') {
            if (titleEl) titleEl.textContent = 'Сотрудники';
            if (createGameBtn) createGameBtn.hidden = true;
            if (createShopBtn) createShopBtn.hidden = true;
            if (updateEmployeesBtn) updateEmployeesBtn.hidden = false;
            if (showStickerCreateModalBtn) showStickerCreateModalBtn.hidden = true;

            bodyEl.innerHTML = '<p class="placeholder">Загружаем сотрудников…</p>';
            try {
                await reloadSettingsEmployees();
            } catch (err) {
                bodyEl.innerHTML = '<p class="placeholder">Не удалось загрузить сотрудников.</p>';
            }

        } else if (section === 'purchases') {
            if (titleEl) titleEl.textContent = 'История покупок';
            if (createGameBtn) createGameBtn.hidden = true;
            if (createShopBtn) createShopBtn.hidden = true;
            if (updateEmployeesBtn) updateEmployeesBtn.hidden = true;
            if (showStickerCreateModalBtn) showStickerCreateModalBtn.hidden = true;

            bodyEl.innerHTML = '<p class="placeholder">Загружаем историю покупок…</p>';

            try {
                settingsPurchasesPage = 1;
                loadPurchasesForSettings(1, settingsPurchasesPageSize);
            } catch (err) {
                bodyEl.innerHTML = '<p class="placeholder">Не удалось загрузить историю покупок</p>';
            }
        } else if (section === 'events') {
            if (titleEl) titleEl.textContent = 'События';
            if (createGameBtn) createGameBtn.hidden = true;
            if (createShopBtn) createShopBtn.hidden = true;
            if (updateEmployeesBtn) updateEmployeesBtn.hidden = true;
            if (showStickerCreateModalBtn) showStickerCreateModalBtn.hidden = true;

            bodyEl.innerHTML = '<p class="placeholder">Загружаем события…</p>';

            try {
                settingsEventsPage = 1;
                await loadSettingsEvents(1, settingsEventsPageSize);
            } catch (err) {
                bodyEl.innerHTML = '<p class="placeholder">Не удалось загрузить события</p>';
            }
        } else if (section === 'stickers') {
            if (titleEl) titleEl.textContent = 'Список стикеров';
            if (createGameBtn) createGameBtn.hidden = true;
            if (createShopBtn) createShopBtn.hidden = true;
            if (updateEmployeesBtn) updateEmployeesBtn.hidden = true;
            if (showStickerCreateModalBtn) showStickerCreateModalBtn.hidden = false;

            bodyEl.innerHTML = '<p class="placeholder">Загружаем список стикеров…</p>';

            try {
                const stickers = await loadSettingsStickers();
                renderSettingsStickers(stickers);
            } catch (err) {
                bodyEl.innerHTML = '<p class="placeholder">Не удалось загрузить список стикеров</p>';
            }
        }
    });


    settingsContent.addEventListener('click', async (event) => {
    const gameEditBtn = event.target.closest('.settings-game-edit-btn');
    if (gameEditBtn) {
        const id = Number(gameEditBtn.dataset.gameId);
        const game = settingsGames.find(g => g.id === id);
        if (!game) return;
        await openGameEditModal(game);
        return;
    }

    const gameDeleteBtn = event.target.closest('.settings-game-delete-btn');
    if (gameDeleteBtn) {
        const id = Number(gameDeleteBtn.dataset.gameId);
        const game = settingsGames.find(g => g.id === id);
        if (!game) return;

        const ok = confirm(`Удалить игру «${game.name}»?`);
        if (!ok) return;

        await deleteGame(id);
        await reloadSettingsGames();
        return;
    }

    const itemEditBtn = event.target.closest('.settings-item-edit-btn');
    if (itemEditBtn) {
        const id = Number(itemEditBtn.dataset.itemId);
        const item = settingsItems.find(i => i.id === id);
        if (!item) return;

        openShopItemEditModal(item);
        return;
    }

    const itemDeleteBtn = event.target.closest('.settings-item-delete-btn');
    if (itemDeleteBtn) {
        const id = Number(itemDeleteBtn.dataset.itemId);
        const item = settingsItems.find(i => i.id === id);
        if (!item) return;

        const ok = confirm(`Удалить товар «${item.name}»?`);
        if (!ok) return;

        await deleteItem(id);
        await reloadSettingsItems();
        return;
    }

    const employeeEditBtn = event.target.closest('.settings-employee-edit-btn');
    if (employeeEditBtn) {
        const id = employeeEditBtn.dataset.employeeId;
        const employee = settingsEmployees.find(e => String(e.bitrix_id) === String(id));
        if (!employee) return;
        openEmployeeEditModal(employee);
        return;
    }

    const stickerDeleteBtn = event.target.closest('.settings-sticker-delete-btn');
    if (stickerDeleteBtn) {
        const id = Number(stickerDeleteBtn.dataset.stickerId);
        const name = stickerDeleteBtn.dataset.stickerName;

        const ok = confirm(`Удалить стикер «${name}»? Это действие необратимо.`);
        if (!ok) return;

        await deleteSticker(id);
        await reloadSettingsStickers();
        return;
    }
    });
}


function isoToInputDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}


async function openGameEditModal(game) {
    const modal = document.getElementById('game-edit-modal');
    if (!modal || !game) return;

    currentEditingGameId = game.id;

    const nameEl = modal.querySelector('#game-edit-name');
    const descEl = modal.querySelector('#game-edit-description');
    const startEl = modal.querySelector('#game-edit-start');
    const endEl = modal.querySelector('#game-edit-end');
    const limitParamEl = modal.querySelector('#game-edit-limit-param');
    const limitValueEl = modal.querySelector('#game-edit-limit-value');
    const limitToOneEl = modal.querySelector('#game-edit-limit-to-one');
    const isActiveEl = modal.querySelector('#game-edit-is-active');

    if (nameEl) nameEl.value = game.name || '';
    if (descEl) descEl.value = game.description || '';
    if (startEl) startEl.value = isoToInputDate(game.game_start);
    if (endEl) endEl.value = isoToInputDate(game.game_end);
    if (limitParamEl) {
        limitParamEl.value = game.setting_limitParameter || 'day';
    }
    if (limitValueEl) limitValueEl.value = game.setting_limitValue ?? '';
    if (limitToOneEl) limitToOneEl.value = game.setting_limitToOneUser ?? '';
    if (isActiveEl) isActiveEl.checked = Boolean(game.game_is_active);
    const hintEl = modal.querySelector('#game-edit-active-hint');
    if (hintEl && isActiveEl) {
        hintEl.hidden = !isActiveEl.checked;
    }

    try {
        await loadGameParticipantCandidates();
        initGameParticipantsPicker('game-edit');
        setGameParticipantsPickerSelection(
            'game-edit',
            Array.isArray(game.participant_ids) ? game.participant_ids : []
        );
        const picker = getGameParticipantsPickerElements('game-edit');
        if (picker.search) picker.search.value = '';
        renderGameParticipantsPicker('game-edit');
    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось загрузить список участников');
        return;
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
}

function closeGameEditModal() {
    const modal = document.getElementById('game-edit-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    currentEditingGameId = null;
}


async function submitGameEditForm(e) {
    e.preventDefault();

    if (!currentEditingGameId) {
        toast('Не выбрана игра для сохранения');
        return;
    }

    const form = e.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');

    const payload = {};

    const nameEl = form.querySelector('#game-edit-name');
    const descEl = form.querySelector('#game-edit-description');
    const startEl = form.querySelector('#game-edit-start');
    const endEl = form.querySelector('#game-edit-end');
    const limitValueEl = form.querySelector('#game-edit-limit-value');
    const limitToOneEl = form.querySelector('#game-edit-limit-to-one');
    const limitParamEl = form.querySelector('#game-edit-limit-param');
    const isActiveEl = form.querySelector('#game-edit-is-active');

    const name = nameEl?.value.trim();
    if (name) payload.name = name;

    const description = descEl?.value.trim();
    if (description) payload.description = description;

    const start = startEl?.value;
    if (start) payload.game_start = start;

    const end = endEl?.value;
    if (end) payload.game_end = end;

    const limitValue = limitValueEl?.value;
    if (limitValue) payload.setting_limitValue = Number(limitValue);

    const limitToOne = limitToOneEl?.value;
    if (limitToOne) payload.setting_limitToOneUser = Number(limitToOne);

    const limitParam = limitParamEl?.value;
    if (limitParam) payload.setting_limitParameter = limitParam;

    if (isActiveEl) {
        payload.game_is_active = isActiveEl.checked;
    }

    payload.participant_ids = getGameParticipantsPickerSelection('game-edit');

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Сохраняем...';
        }

        const adminId = getCurrentUserId();
        const gameUpdateUrl = adminId
            ? `/api/games/${currentEditingGameId}?admin_id=${encodeURIComponent(adminId)}`
            : `/api/games/${currentEditingGameId}`;
        const res = await fetch(gameUpdateUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            let msg = `Ошибка сохранения игры (${res.status})`;
            try {
                const data = await res.json();
                if (data && data.detail) msg = data.detail;
            } catch (_) {}
            throw new Error(msg);
        }

        const updated = await res.json();

        const idx = settingsGames.findIndex((g) => g.id === updated.id);
        if (idx !== -1) {
            settingsGames[idx] = updated;
        }

        renderSettingsGames(settingsGames);

        gamesLoaded = false;
        loadGames().catch(() => {});

        toast('Игра сохранена');

        closeGameEditModal();
        await reloadSettingsGames();
        await loadGames();
    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось сохранить игру');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Сохранить';
        }
    }
}


async function openGameCreateModal() {
    const modal = document.getElementById('game-create-modal');
    if (!modal) return;

    const form = modal.querySelector('#game-create-form');
    if (form) {
        form.reset();
    }

    const limitParamEl = modal.querySelector('#game-create-limit-param');
    if (limitParamEl) {
        limitParamEl.value = 'day';
    }

    const isActiveEl = modal.querySelector('#game-create-is-active');
    const hintEl = modal.querySelector('#game-create-active-hint');
    if (hintEl && isActiveEl) {
        hintEl.hidden = !isActiveEl.checked;
    }

    try {
        await loadGameParticipantCandidates();
        initGameParticipantsPicker('game-create');
        setGameParticipantsPickerSelection('game-create', []);
        const picker = getGameParticipantsPickerElements('game-create');
        if (picker.search) picker.search.value = '';
        renderGameParticipantsPicker('game-create');
    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось загрузить список участников');
        return;
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
}

function closeGameCreateModal() {
    const modal = document.getElementById('game-create-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
}


async function submitGameCreateForm(e) {
    e.preventDefault();

    const form = e.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');

    const payload = {};

    const nameEl = form.querySelector('#game-create-name');
    const descEl = form.querySelector('#game-create-description');
    const startEl = form.querySelector('#game-create-start');
    const endEl = form.querySelector('#game-create-end');
    const limitValueEl = form.querySelector('#game-create-limit-value');
    const limitToOneEl = form.querySelector('#game-create-limit-to-one');
    const limitParamEl = form.querySelector('#game-create-limit-param');
    const isActiveEl = form.querySelector('#game-create-is-active');

    const name = nameEl?.value.trim();
    if (name) payload.name = name;

    const description = descEl?.value.trim();
    if (description) payload.description = description;

    const start = startEl?.value;
    if (start) payload.game_start = start;

    const end = endEl?.value;
    if (end) payload.game_end = end;

    const limitValue = limitValueEl?.value;
    if (limitValue) payload.setting_limitValue = Number(limitValue);

    const limitToOne = limitToOneEl?.value;
    if (limitToOne) payload.setting_limitToOneUser = Number(limitToOne);

    const limitParam = limitParamEl?.value;
    if (limitParam) payload.setting_limitParameter = limitParam;

    if (isActiveEl) {
        payload.game_is_active = Boolean(isActiveEl.checked);
    }

    payload.participant_ids = getGameParticipantsPickerSelection('game-create');

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Создаём...';
        }

        const adminId = getCurrentUserId();
        const gameCreateUrl = adminId
            ? `/api/games?admin_id=${encodeURIComponent(adminId)}`
            : '/api/games';
        const res = await fetch(gameCreateUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            let msg = `Ошибка создания игры (${res.status})`;
            try {
                const data = await res.json();
                if (data?.detail) msg = data.detail;
            } catch (err) {
            }
            throw new Error(msg);
        }

        toast('Игра создана');
        closeGameCreateModal();
        await reloadSettingsGames();
        await loadGames();
        await loadOverallRating();
    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось создать игру');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Создать';
        }
    }
}


async function deleteGame(gameId) {
    try {
        const adminId = getCurrentUserId();
        const gameDeleteUrl = adminId
            ? `/api/games/${gameId}?admin_id=${encodeURIComponent(adminId)}`
            : `/api/games/${gameId}`;
        const res = await fetch(gameDeleteUrl, {
            method: 'DELETE',
        });

        if (!res.ok) {
            let msg = `Ошибка удаления игры (${res.status})`;
            try {
                const data = await res.json();
                if (data?.detail) {
                    msg = data.detail;
                }
            } catch (_) {}
            throw new Error(msg);
        }

        toast('Игра удалена');

        await reloadSettingsGames();
        await loadGames();
        await loadOverallRating();

    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось удалить игру');
        throw err;
    }
}


function openShopItemCreateModal() {
    const modal = document.getElementById('shop-item-create-modal');
    if (!modal) return;

    const form = modal.querySelector('#shop-item-create-form');
    if (form) {
        form.reset();
    }

    const activeCheckbox = modal.querySelector('#shop-item-create-is-active');
    if (activeCheckbox) {
        activeCheckbox.checked = true;
    }

    const fileInput = modal.querySelector('#shop-item-create-photo');
    const photoUrlInput = modal.querySelector('#shop-item-create-photo-url');
    const preview = modal.querySelector('#shop-item-create-photo-preview');
    const previewImg = preview?.querySelector('img');
    const clearBtn = modal.querySelector('#shop-item-create-photo-preview-clear');

    const resetPhoto = () => {
        if (fileInput) fileInput.value = '';
        if (photoUrlInput) photoUrlInput.value = '';
        if (previewImg) previewImg.removeAttribute('src');
        if (preview) preview.hidden = true;
    };

    resetPhoto();

    if (fileInput && !fileInput.dataset.uploadInit) {
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) {
                resetPhoto();
                return;
            }

            try {
                const url = await uploadShopItemImage(file);

                if (photoUrlInput) {
                    photoUrlInput.value = url;
                }

                if (preview && previewImg) {
                    previewImg.src = url;
                    preview.hidden = false;
                }

                toast('Фото загружено');
            } catch (err) {
                console.error(err);
                toast(err.message || 'Не удалось загрузить фото');
                resetPhoto();
            }
        });

        fileInput.dataset.uploadInit = '1';
    }

    if (clearBtn && !clearBtn.dataset.initClear) {
        clearBtn.addEventListener('click', () => {
            resetPhoto();
        });
        clearBtn.dataset.initClear = '1';
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
}


function closeShopItemCreateModal() {
    const modal = document.getElementById('shop-item-create-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
}


let settingsItems = [];
let currentEditingItemId = null;


async function loadSettingsItems() {
    try {
        const res = await fetch('/api/items');
        if (!res.ok) {
            throw new Error(`Ошибка загрузки товаров (${res.status})`);
        }
        const data = await res.json();
        settingsItems = Array.isArray(data) ? data : [];
        return settingsItems;
    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось загрузить товары магазина');
        throw err;
    }
}


async function uploadShopItemImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/items/upload-image', {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        let msg = `Ошибка загрузки фото (${res.status})`;
        try {
            const data = await res.json();
            if (data?.detail) msg = data.detail;
        } catch (_) {
        }
        throw new Error(msg);
    }

    const data = await res.json();
    if (!data || !data.url) {
        throw new Error('Сервер не вернул URL загруженного фото');
    }

    return data.url;
}


async function reloadSettingsItems() {
    const items = await loadSettingsItems();
    renderSettingsItems(items);
}


function renderSettingsItems(items) {
    const body = document.querySelector('#settings #settings-body');
    if (!body) return;

    if (!items || !items.length) {
        body.innerHTML = `
            <p class="placeholder">Товаров еще нет</p>
        `;
        return;
    }

    const rows = items.map((item) => `
        <tr>
            <td>${esc(item.name ?? '—')}</td>
            <td>${esc(item.description ?? '—')}</td>
            <td>${Number(item.price ?? 0).toLocaleString('ru-RU')}</td>
            <td>${Number(item.stock ?? 0).toLocaleString('ru-RU')}</td>
            <td>${item.is_active ? 'Активен' : 'Скрыт'}</td>
            <td class="table-actions__cell">
                <button
                    type="button"
                    class="settings-item-edit-btn icon-btn icon-btn--edit"
                    data-item-id="${item.id}"
                    aria-label="Редактировать товар «${esc(item.name ?? '')}»"
                >
                    <span class="icon-btn__emoji" aria-hidden="true">✏️</span>
                </button>
                <button
                    type="button"
                    class="settings-item-delete-btn icon-btn icon-btn--delete"
                    data-item-id="${item.id}"
                    title="Удалить товар"
                >
                    <span class="icon-btn__emoji" aria-hidden="true">❌</span>
                </button>
            </td>
        </tr>
    `).join('');

    body.innerHTML = `
        <div class="table-wrap">
            <table class="table">
                <thead>
                    <tr>
                        <th>Название</th>
                        <th>Описание</th>
                        <th>Цена</th>
                        <th>Остаток</th>
                        <th>Статус</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}


async function submitShopItemCreateForm(e) {
    e.preventDefault();

    const form = e.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');

    const payload = {};

    const nameEl = form.querySelector('#shop-item-create-name');
    const descEl = form.querySelector('#shop-item-create-description');
    const priceEl = form.querySelector('#shop-item-create-price');
    const stockEl = form.querySelector('#shop-item-create-stock');
    const activeEl = form.querySelector('#shop-item-create-is-active');

    const name = nameEl?.value.trim();
    if (name) payload.name = name;

    const description = descEl?.value.trim();
    if (description) payload.description = description;

    const price = priceEl?.value;
    if (price !== '' && price != null) {
        payload.price = Number(price);
    }

    const photoUrlEl = form.querySelector('#shop-item-create-photo-url');
    if (photoUrlEl && photoUrlEl.value) {
        payload.photo_url = photoUrlEl.value;
    }

    const stock = stockEl?.value;
    if (stock !== '' && stock != null) {
        payload.stock = Number(stock);
    }

    if (activeEl) {
        payload.is_active = Boolean(activeEl.checked);
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Создаём...';
        }

        const adminId = getCurrentUserId();
        const itemCreateUrl = adminId
            ? `/api/items?admin_id=${encodeURIComponent(adminId)}`
            : '/api/items';
        const res = await fetch(itemCreateUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            let msg = `Ошибка создания товара (${res.status})`;
            try {
                const data = await res.json();
                if (data?.detail) msg = data.detail;
            } catch (err) {
            }
            throw new Error(msg);
        }

        toast('Товар создан');
        closeShopItemCreateModal();
        await reloadSettingsItems();
        await loadShopItems();
    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось создать товар');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Создать';
        }
    }
}


async function deleteItem(id) {
    try {
        const adminId = getCurrentUserId();
        const itemDeleteUrl = adminId
            ? `/api/items/${id}?admin_id=${encodeURIComponent(adminId)}`
            : `/api/items/${id}`;
        const res = await fetch(itemDeleteUrl, {
            method: 'DELETE',
        });

        if (!res.ok) {
            let msg = '';

            try {
                const data = await res.json();

                if (typeof data?.detail === 'string') {
                    msg = data.detail;
                } else if (Array.isArray(data?.detail)) {
                    msg = data.detail
                        .map((err) => err.msg || err.detail || JSON.stringify(err))
                        .join('\n');
                }
            } catch (_) {
            }

            if (!msg) {
                msg = `Ошибка удаления товара (код ${res.status})`;
            }

            toast(msg);

            throw new Error(msg);
        }

        toast('Товар удалён');
        await reloadSettingsItems();
        await loadShopItems();
    } catch (err) {
        console.error(err);
        if (err?.message) {
            toast(err.message);
        } else {
            toast('Не удалось удалить товар');
        }
        throw err;
    }
}


function openShopItemEditModal(item) {
    const modal = document.getElementById('shop-item-edit-modal');
    if (!modal || !item) return;

    currentEditingItemId = item.id;

    const form = modal.querySelector('#shop-item-edit-form');
    if (form) {
        form.reset();
    }

    const nameEl = modal.querySelector('#shop-item-edit-name');
    const descEl = modal.querySelector('#shop-item-edit-description');
    const priceEl = modal.querySelector('#shop-item-edit-price');
    const stockEl = modal.querySelector('#shop-item-edit-stock');
    const activeEl = modal.querySelector('#shop-item-edit-is-active');
    const photoUrlEl = modal.querySelector('#shop-item-edit-photo-url');
    const photoPreviewEl = modal.querySelector('#shop-item-edit-photo-preview');
    const photoImgEl = photoPreviewEl?.querySelector('img');

    if (nameEl) nameEl.value = item.name ?? '';
    if (descEl) descEl.value = item.description ?? '';
    if (priceEl) priceEl.value = item.price != null ? String(item.price) : '';
    if (stockEl) stockEl.value = item.stock != null ? String(item.stock) : '';
    if (activeEl) activeEl.checked = Boolean(item.is_active);

    if (item.photo_url) {
        if (photoUrlEl) photoUrlEl.value = item.photo_url;
        if (photoImgEl) photoImgEl.src = item.photo_url;
        photoPreviewEl.hidden = false;
    } else {
        photoPreviewEl.hidden = true;
    }

    const fileInput = modal.querySelector('#shop-item-edit-photo');
    const clearBtn = modal.querySelector('#shop-item-edit-photo-preview-clear');

    const resetPhoto = () => {
        if (fileInput) fileInput.value = '';
        if (photoUrlEl) photoUrlEl.value = '';
        if (photoImgEl) photoImgEl.removeAttribute('src');
        if (photoPreviewEl) photoPreviewEl.hidden = true;
    };

    if (clearBtn) {
        clearBtn.addEventListener('click', resetPhoto);
    }

    if (fileInput) {
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;

            try {
                const url = await uploadShopItemImage(file);

                if (photoUrlEl) photoUrlEl.value = url;
                if (photoImgEl) photoImgEl.src = url;

                photoPreviewEl.hidden = false;
            } catch (err) {
                console.error(err);
                toast(err.message || 'Не удалось загрузить фото');
                resetPhoto();
            }
        });
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
}


function closeShopItemEditModal() {
    const modal = document.getElementById('shop-item-edit-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    currentEditingItemId = null;
}


async function submitShopItemEditForm(e) {
    e.preventDefault();

    if (!currentEditingItemId) {
        console.error('Нет id редактируемого товара');
        return;
    }

    const form = e.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');

    const payload = {};

    const nameEl = form.querySelector('#shop-item-edit-name');
    const descEl = form.querySelector('#shop-item-edit-description');
    const priceEl = form.querySelector('#shop-item-edit-price');
    const stockEl = form.querySelector('#shop-item-edit-stock');
    const activeEl = form.querySelector('#shop-item-edit-is-active');

    const name = nameEl?.value.trim();
    if (name) payload.name = name;

    const description = descEl?.value.trim();
    if (description || description === '') {
        payload.description = description;
    }

    const price = priceEl?.value;
    if (price !== '' && price != null) {
        payload.price = Number(price);
    }

    const stock = stockEl?.value;
    if (stock !== '' && stock != null) {
        payload.stock = Number(stock);
    }

    if (activeEl) {
        payload.is_active = Boolean(activeEl.checked);
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Сохраняем...';
        }

        const adminId = getCurrentUserId();
        const itemUpdateUrl = adminId
            ? `/api/items/${currentEditingItemId}?admin_id=${encodeURIComponent(adminId)}`
            : `/api/items/${currentEditingItemId}`;
        const res = await fetch(itemUpdateUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            let msg = `Ошибка обновления товара (${res.status})`;
            try {
                const data = await res.json();
                if (data?.detail) msg = data.detail;
            } catch (_) {
            }
            throw new Error(msg);
        }

        toast('Товар обновлён');
        closeShopItemEditModal();
        await reloadSettingsItems();
        await loadShopItems();
    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось обновить товар');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Сохранить';
        }
    }
}


async function updateEmployeesFromBitrix() {
    const btn = document.getElementById('update-employees-btn');
    const userId = getCurrentUserId();

    if (!userId) {
        toast('Нет user_id в URL');
        return;
    }

    const originalText = btn?.textContent || 'Обновить сотрудников';

    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Обновляем...';
        }

        const res = await fetch(`/api/all_users?user_id=${encodeURIComponent(userId)}`, {
            method: 'POST',
        });

        if (!res.ok) {
            let msg = `Не удалось обновить сотрудников (${res.status})`;
            try {
                const data = await res.json();
                if (data?.detail) msg = data.detail;
            } catch (_) {}
            throw new Error(msg);
        }

        let data = null;
        try {
            data = await res.json();
        } catch (_) {
            data = null;
        }

        if (data?.count != null) {
            toast(`Сотрудники обновлены (${data.count})`);
        } else if (data?.message) {
            toast(data.message);
        } else {
            toast('Список сотрудников обновлён');
        }
        const employeesTabBtn = document.querySelector(
            '#settings .settings-sidebar .settings-nav__button[data-settings-section="employees"].settings-nav__button--active'
        );
        if (employeesTabBtn) {
            await reloadSettingsEmployees();
        }
    } catch (e) {
        console.error(e);
        toast(e.message || 'Ошибка обновления сотрудников');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}


let settingsEmployees = [];
let settingsEmployeesLimit = 25;
let settingsEmployeesHasMore = true;
let settingsEmployeesSearchQuery = '';


function normalizeSettingsEmployeeSearch(value) {
    return String(value ?? '')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .trim();
}


function applySettingsEmployeesSearchFilter() {
    const body = document.querySelector('#settings #settings-body');
    if (!body) return;

    const rows = [...body.querySelectorAll('[data-settings-employee-row]')];
    const emptyEl = body.querySelector('#settings-employees-search-empty');
    if (!rows.length) {
        if (emptyEl) emptyEl.hidden = true;
        return;
    }

    const query = normalizeSettingsEmployeeSearch(settingsEmployeesSearchQuery);
    let visibleCount = 0;

    rows.forEach((row) => {
        const haystack = row.dataset.search || '';
        const isMatch = !query || haystack.includes(query);
        row.hidden = !isMatch;
        if (isMatch) visibleCount += 1;
    });

    if (emptyEl) {
        emptyEl.hidden = visibleCount > 0 || !query;
    }
}


async function loadSettingsEmployees(limit = settingsEmployeesLimit, offset = 0, { append = false } = {}) {
    try {
        const res = await fetch(`/api/users?limit=${limit}&offset=${offset}`);
        if (!res.ok) {
            throw new Error(`Не удалось загрузить сотрудников (${res.status})`);
        }

        const chunk = await res.json();

        if (!append) {
            settingsEmployees = chunk;
        } else {
            settingsEmployees = settingsEmployees.concat(chunk);
        }

        settingsEmployeesHasMore = chunk.length === limit;
        renderSettingsEmployees(settingsEmployees);
    } catch (err) {
        console.error(err);
        settingsEmployees = [];
        renderSettingsEmployees([]);
        toast(err.message || 'Ошибка загрузки сотрудников');
    }
}


async function reloadSettingsEmployees() {
    settingsEmployeesHasMore = true;
    gameParticipantCandidatesLoaded = false;
    gameParticipantCandidates = [];
    await loadSettingsEmployees(settingsEmployeesLimit, 0, { append: false });
}


function renderSettingsEmployees(employees) {
    const body = document.querySelector('#settings #settings-body');
    if (!body) return;

    if (!employees || !employees.length) {
        body.innerHTML = `
            <p class="placeholder">Сотрудников еще нет</p>
        `;
        return;
    }

    const rows = employees.map((u) => {
        const fullName = [u.name, u.lastname].filter(Boolean).join(' ') || '—';
        const coins = (u.coins != null) ? Number(u.coins).toLocaleString('ru-RU') : '0';
        const isGamerLabel = u.is_gamer ? 'Да' : 'Нет';
        const isAdminLabel = u.is_admin ? 'Да' : 'Нет';
        const searchIndex = normalizeSettingsEmployeeSearch([
            fullName,
            u.email,
            u.position,
            u.name,
            u.lastname,
            u.bitrix_id,
        ].filter(Boolean).join(' '));
        const avatarHtml = `
            <span class="settings-employee__avatar">
                ${u.photo_url ? `<img src="${u.photo_url}" alt="">` : ''}
            </span>
        `;

        return `
            <tr data-settings-employee-row="1" data-search="${esc(searchIndex)}">
                <td class="settings-employee__name">
                    ${avatarHtml}
                    <span class="settings-employee__fio">${esc(fullName)}</span>
                </td>
                <td>${coins}</td>
                <td>${esc(isGamerLabel)}</td>
                <td>${esc(isAdminLabel)}</td>
                <td class="table-actions__cell">
                    <button
                        type="button"
                        class="settings-employee-edit-btn icon-btn icon-btn--edit"
                        data-employee-id="${u.bitrix_id}"
                        aria-label="Редактировать сотрудника «${esc(fullName)}»"
                    >
                        <span class="icon-btn__emoji" aria-hidden="true">✏️</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    body.innerHTML = `
        <div class="settings-search">
            <label class="settings-search__field" for="settings-employees-search">
                <span class="settings-search__icon" aria-hidden="true">🔎</span>
                <input
                    type="search"
                    id="settings-employees-search"
                    class="settings-search__input"
                    placeholder=""
                    value="${esc(settingsEmployeesSearchQuery)}"
                    autocomplete="off"
                >
            </label>
        </div>
        <div class="table-wrap">
            <table class="table">
                <thead>
                    <tr>
                        <th>ФИО</th>
                        <th>Баланс</th>
                        <th>Принимает участие в играх</th>
                        <th>Расширенные права доступа</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
        <p id="settings-employees-search-empty" class="placeholder settings-search__empty" hidden>
            По вашему запросу сотрудники не найдены.
        </p>
        <div class="settings-pagination">
            <button
                type="button"
                id="settings-employees-load-more"
                class="btn btn--secondary btn--tiny"
                ${settingsEmployeesHasMore ? '' : 'hidden'}
            >
                Показать ещё
            </button>
        </div>
    `;

    const loadMoreBtn = document.getElementById('settings-employees-load-more');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            const offset = settingsEmployees.length;
            loadSettingsEmployees(settingsEmployeesLimit, offset, { append: true });
        });
    }

    const searchInput = document.getElementById('settings-employees-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            settingsEmployeesSearchQuery = searchInput.value || '';
            applySettingsEmployeesSearchFilter();
        });
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && searchInput.value) {
                searchInput.value = '';
                settingsEmployeesSearchQuery = '';
                applySettingsEmployeesSearchFilter();
            }
        });
    }

    applySettingsEmployeesSearchFilter();
}


function openEmployeeEditModal(employee) {
    const modal = document.getElementById('employee-edit-modal');
    if (!modal || !employee) return;

    currentEditingEmployeeId = employee.bitrix_id;

    const form = modal.querySelector('#employee-edit-form');
    if (form) {
        form.reset();
    }

    const nameEl = modal.querySelector('#employee-edit-name');
    const lastnameEl = modal.querySelector('#employee-edit-lastname');
    const coinsEl = modal.querySelector('#employee-edit-coins');
    const isGamerEl = modal.querySelector('#employee-edit-is-gamer');
    const isAdminEl = modal.querySelector('#employee-edit-is-admin');

    if (nameEl) nameEl.value = employee.name ?? '';
    if (lastnameEl) lastnameEl.value = employee.lastname ?? '';
    if (coinsEl) coinsEl.value = employee.coins != null ? String(employee.coins) : '0';
    if (isGamerEl) isGamerEl.checked = Boolean(employee.is_gamer);
    if (isAdminEl) isAdminEl.checked = Boolean(employee.is_admin);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
}


function closeEmployeeEditModal() {
    const modal = document.getElementById('employee-edit-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    currentEditingEmployeeId = null;
}


async function submitEmployeeEditForm(e) {
    e.preventDefault();

    if (!currentEditingEmployeeId) {
        console.error('Нет id редактируемого сотрудника');
        return;
    }

    const form = e.currentTarget;
    const submitBtn = form.querySelector('button[type="submit"]');

    const payload = {};

    const nameEl = form.querySelector('#employee-edit-name');
    const lastnameEl = form.querySelector('#employee-edit-lastname');
    const coinsEl = form.querySelector('#employee-edit-coins');
    const isGamerEl = form.querySelector('#employee-edit-is-gamer');
    const isAdminEl = form.querySelector('#employee-edit-is-admin');

    const name = nameEl?.value.trim();
    const lastname = lastnameEl?.value.trim();
    const coins = coinsEl?.value;

    if (name) payload.name = name;
    if (lastname) payload.lastname = lastname;
    if (coins !== '' && coins != null) {
        payload.coins = Number(coins);
    }

    if (isGamerEl) {
        payload.is_gamer = Boolean(isGamerEl.checked);
    }

    if (isAdminEl) {
        payload.is_admin = Boolean(isAdminEl.checked);
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Сохраняем...';
        }

        const adminId = getCurrentUserId();

        const res = await fetch(`/api/users/${encodeURIComponent(currentEditingEmployeeId)}?admin_id=${encodeURIComponent(adminId)}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            let msg = `Ошибка обновления сотрудника (${res.status})`;
            try {
                const data = await res.json();
                if (data?.detail) msg = data.detail;
            } catch (_) {}
            throw new Error(msg);
        }

        toast('Данные сотрудника обновлены');
        closeEmployeeEditModal();
        await loadCurrentUser();
        await reloadSettingsEmployees();
    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось обновить данные сотрудника');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Сохранить';
        }
    }
}


function initTooltips() {
    const tooltips = document.querySelectorAll('.stat-card__tooltip');

    tooltips.forEach(tooltip => {
        const icon = tooltip.querySelector('.tooltip-icon');

        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = tooltip.classList.contains('active');

            document.querySelectorAll('.stat-card__tooltip.active').forEach(t => {
                if (t !== tooltip) t.classList.remove('active');
            });

            tooltip.classList.toggle('active', !isActive);
        });
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.stat-card__tooltip.active').forEach(tooltip => {
            tooltip.classList.remove('active');
        });
    });
}


let currentPurchasesPage = 1;
let purchasesLimit = 5;
let purchasesTotalPages = 1;


async function loadPurchasesHistory() {
    const userId = getCurrentUserId();
    if (!userId) return;

    const tbody = document.querySelector('#purchases-history tbody');
    if (tbody) {
    }

    try {
        const res = await fetch(
            `/api/user/${encodeURIComponent(userId)}/purchases?page=${currentPurchasesPage}&limit=${purchasesLimit}`
        );
        if (!res.ok) throw new Error(`Не удалось загрузить покупки (${res.status})`);

        const data = await res.json();

        purchasesTotalPages = data.total_pages;
        renderPurchasesHistory(data.purchases);
        updatePurchasesPagination();

    } catch (e) {
        console.error(e);
        if (tbody) {
            tbody.innerHTML = `<tr><td class="table__empty" colspan="3">Ошибка загрузки истории</td></tr>`;
        }
    } finally {
        if (tbody) tbody.style.opacity = '1';
    }
}


function renderPurchasesHistory(rows) {
    const tbody = document.querySelector('#purchases-history tbody');
    if (!tbody) return;

    if (!rows || !rows.length) {
        tbody.innerHTML = `<tr><td class="table__empty" colspan="3">Покупок еще не было</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => {
        const date = esc(fmtDate(r.created_at));
        const price = Number(r.amount_spent).toLocaleString('ru-RU');

        return `
            <tr>
                <td>${date}</td>
                <td>${esc(r.item_name)}</td>
                <td>${price}</td>
            </tr>
        `;
    }).join('');
}


function updatePurchasesPagination() {
    const prevBtn = document.getElementById('purchases-prev-btn');
    const nextBtn = document.getElementById('purchases-next-btn');
    const pageLabel = document.getElementById('purchases-current-page');

    if (pageLabel) pageLabel.textContent = `Страница ${currentPurchasesPage}`;

    if (prevBtn) prevBtn.disabled = currentPurchasesPage === 1;
    if (nextBtn) nextBtn.disabled = currentPurchasesPage >= purchasesTotalPages;
}


function initPurchasesHistory() {
    const prevBtn = document.getElementById('purchases-prev-btn');
    const nextBtn = document.getElementById('purchases-next-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentPurchasesPage > 1) {
                currentPurchasesPage--;
                loadPurchasesHistory();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentPurchasesPage < purchasesTotalPages) {
                currentPurchasesPage++;
                loadPurchasesHistory();
            }
        });
    }
}


let stickerCatalog = [];


async function loadStickerCatalog() {
    if (stickerCatalog.length > 0) return;

    try {
        const res = await fetch('/api/stickers');
        if (!res.ok) {
            const errorData = await res.json()
            const errorMessage = errorData.detail || 'Общая ошибка';
            throw new Error(errorMessage);
        }
        stickerCatalog = await res.json();
        renderStickerSelector(stickerCatalog);
    } catch (e) {
        console.error("Ошибка загрузки стикеров:", e);
    }
}


function renderStickerSelector(catalog) {
    const selectorContainer = document.getElementById('sticker-selector');
    if (!selectorContainer || catalog.length === 0) return;

    let html = '';

    catalog.forEach(sticker => {
        html += `
            <button
                type="button"
                class="sticker-item"
                data-id="${sticker.id}"
                data-name="${esc(sticker.name || 'Стикер')}"
                title="${esc(sticker.name || '')}"
            >
                <img src="${esc(sticker.url)}"
                     alt="${esc(sticker.name || 'Стикер')}"
                     loading="lazy" />
            </button>
        `;
    });

    selectorContainer.innerHTML = html;
}


function initStickerSelector() {
    const selectorContainer = document.getElementById('sticker-selector');
    const selectedInput = document.getElementById('selected-sticker-id');
    const toggleBtn = document.getElementById('sticker-selector-toggle');

    if (!selectorContainer || !selectedInput || !toggleBtn) return;

    setStickerToggleState(toggleBtn, false, 'Выберите стикер');

    toggleBtn.addEventListener('click', () => {
        const isHidden = selectorContainer.hasAttribute('hidden');

        if (isHidden) {
            selectorContainer.removeAttribute('hidden');
        } else {
            selectorContainer.setAttribute('hidden', '');
        }

        toggleBtn.setAttribute('aria-expanded', String(isHidden));
    });

    selectorContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.sticker-item');
        if (!button) return;
        const activeButton = selectorContainer.querySelector('.sticker-item--active');

        if (activeButton === button) {
            button.classList.remove('sticker-item--active');
            selectedInput.value = '';
            setStickerToggleState(toggleBtn, false, 'Выберите стикер');
            return;
        }

        if (activeButton) {
            activeButton.classList.remove('sticker-item--active');
        }

        button.classList.add('sticker-item--active');
        const selectedId = button.dataset.id;
        selectedInput.value = selectedId;

        const name = button.dataset.name || 'Стикер выбран';
        setStickerToggleState(toggleBtn, true, name);

        selectorContainer.setAttribute('hidden', '');
        toggleBtn.setAttribute('aria-expanded', 'false');
    });
}


let settingsPurchasesPage = 1;
let settingsPurchasesTotalPages = 1;
const settingsPurchasesPageSize = 15;


function renderSettingsPurchasesPages() {
    const root = document.getElementById('settings-purchases-pages');
    if (!root) return;

    const safeTotalPages = Math.max(1, Number(settingsPurchasesTotalPages) || 1);
    const safeCurrent = Math.min(Math.max(1, Number(settingsPurchasesPage) || 1), safeTotalPages);

    if (safeTotalPages <= 1) {
        root.hidden = true;
        root.innerHTML = '';
        return;
    }

    const pages = buildSmallPages(safeTotalPages, safeCurrent);
    root.hidden = false;
    root.innerHTML = pages.map((p) => {
        if (p === '…') {
            return '<span class="games-pages__ellipsis" aria-hidden="true">…</span>';
        }
        const page = Number(p);
        const activeClass = page === safeCurrent ? ' games-pages__btn--active' : '';
        return `<button type="button" class="games-pages__btn${activeClass}" data-page="${page}" aria-label="Страница ${page}" aria-current="${page === safeCurrent ? 'page' : 'false'}">${page}</button>`;
    }).join('');
}


async function loadPurchasesForSettings(page = settingsPurchasesPage, limit = settingsPurchasesPageSize) {
    const settingsBody = document.getElementById("settings-body");
    if (!settingsBody) return;

    settingsPurchasesPage = Math.max(1, Number(page) || 1);

    settingsBody.innerHTML = `
        <p class="placeholder">Загрузка истории покупок…</p>
    `;

    try {
        const response = await fetch(`/api/purchases?page=${settingsPurchasesPage}&limit=${limit}`);
        if (!response.ok) {
            throw new Error("Не удалось загрузить покупки");
        }

        const data = await response.json();
        settingsPurchasesTotalPages = Math.max(1, Number(data.total_pages) || 1);
        if (settingsPurchasesPage > settingsPurchasesTotalPages) {
            settingsPurchasesPage = settingsPurchasesTotalPages;
        }

        if (!data.purchases || data.purchases.length === 0) {
            settingsBody.innerHTML = `
                <p class="placeholder">Покупок еще не было</p>
            `;
            return;
        }

        const rows = data.purchases.map(p => {
            const createdAt = new Date(p.created_at);
            const date = createdAt.toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });

            const last = p.buyer_lastname ? ` ${p.buyer_lastname}` : '';
            const who = `${p.buyer_name}${last}`;

            return `
                <tr>
                    <td>${esc(date)}</td>
                    <td>${esc(who)}</td>
                    <td>${esc(p.item_name)}</td>
                    <td>${Number(p.amount_spent).toLocaleString('ru-RU')}</td>
                </tr>
            `;
        }).join('');

        settingsBody.innerHTML = `
            <div class="table-wrap">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Дата</th>
                            <th>Кто</th>
                            <th>Товар</th>
                            <th>Цена</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
            <div id="settings-purchases-pages" class="games-pages" hidden></div>
        `;

        renderSettingsPurchasesPages();
        const pagesRoot = document.getElementById('settings-purchases-pages');
        if (pagesRoot && pagesRoot.dataset.init !== '1') {
            pagesRoot.addEventListener('click', (event) => {
                const btn = event.target.closest('.games-pages__btn[data-page]');
                if (!btn) return;
                const nextPage = Number(btn.dataset.page || '1');
                if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage === settingsPurchasesPage) return;
                loadPurchasesForSettings(nextPage, settingsPurchasesPageSize);
            });
            pagesRoot.dataset.init = '1';
        }

    } catch (error) {
        console.error(error);
        settingsBody.innerHTML = `
            <p class="placeholder">Не удалось загрузить историю покупок</p>
        `;
    }
}


let settingsEventsPage = 1;
let settingsEventsTotalPages = 1;
const settingsEventsPageSize = 15;


function formatSettingsEventType(eventType) {
    const labels = {
        game_created: 'Создание игры',
        game_updated: 'Изменение игры',
        game_deleted: 'Удаление игры',
        item_created: 'Создание товара',
        item_updated: 'Изменение товара',
        item_deleted: 'Удаление товара',
        item_purchased: 'Покупка товара',
        employee_coins_changed: 'Изменение монет',
    };
    return labels[eventType] || eventType || 'Событие';
}


function formatSettingsEventFieldLabel(field) {
    const labels = {
        name: 'Название',
        description: 'Описание',
        price: 'Цена',
        stock: 'Остаток',
        is_active: 'Активен',
        game_start: 'Дата начала',
        game_end: 'Дата завершения',
        game_is_active: 'Игра активна',
        setting_limitParameter: 'Период лимита',
        setting_limitValue: 'Лимит',
        setting_limitToOneUser: 'Лимит одному',
        participant_ids: 'Участники',
        coins: 'Монеты',
        is_gamer: 'Участвует в играх',
        is_admin: 'Админ',
        is_superadmin: 'Суперадмин',
    };
    return labels[field] || field;
}


function formatSettingsEventFieldValue(field, value) {
    if (value == null) return '—';

    if (field === 'price' || field === 'coins') {
        return `${Number(value || 0).toLocaleString('ru-RU')} монет`;
    }
    if (field === 'stock' || field === 'setting_limitValue' || field === 'setting_limitToOneUser') {
        return Number(value || 0).toLocaleString('ru-RU');
    }
    if (field === 'is_active' || field === 'game_is_active' || field === 'is_gamer' || field === 'is_admin' || field === 'is_superadmin') {
        return value ? 'Да' : 'Нет';
    }
    if (field === 'setting_limitParameter') {
        const periodMap = {
            day: 'День',
            week: 'Неделя',
            month: 'Месяц',
            game: 'Игра',
        };
        return periodMap[String(value)] || String(value);
    }
    if (field === 'game_start' || field === 'game_end' || field === 'created_at') {
        return fmtDateTime(value);
    }
    if (field === 'participant_ids' && Array.isArray(value)) {
        if (value.length === 0) return 'пусто';
        return value.join(', ');
    }
    if (Array.isArray(value)) {
        return value.join(', ');
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (_) {
            return String(value);
        }
    }
    return String(value);
}


function renderSettingsEventDetails(eventRow) {
    const payload = eventRow?.payload || null;
    if (!payload || typeof payload !== 'object') {
        return String(eventRow?.message || '—');
    }

    if (eventRow.event_type === 'employee_coins_changed') {
        const oldCoins = Number(payload.old_coins ?? 0).toLocaleString('ru-RU');
        const newCoins = Number(payload.new_coins ?? 0).toLocaleString('ru-RU');
        const deltaRaw = Number(payload.delta ?? 0);
        const deltaAbs = Math.abs(deltaRaw).toLocaleString('ru-RU');
        const deltaStr = `${deltaRaw >= 0 ? '+' : '-'}${deltaAbs}`;
        return `Монеты: было ${oldCoins}, стало ${newCoins} (${deltaStr})`;
    }

    const changedFields = Array.isArray(payload.changed_fields) ? payload.changed_fields : [];
    const before = payload.before && typeof payload.before === 'object' ? payload.before : null;
    const after = payload.after && typeof payload.after === 'object' ? payload.after : null;

    if (changedFields.length > 0 && before && after) {
        const parts = changedFields.map((field) => {
            const label = formatSettingsEventFieldLabel(field);
            const beforeText = formatSettingsEventFieldValue(field, before[field]);
            const afterText = formatSettingsEventFieldValue(field, after[field]);
            return `${label}: было ${beforeText}, стало ${afterText}`;
        });
        return parts.join(' | ');
    }

    if (changedFields.length > 0) {
        const labels = changedFields.map(formatSettingsEventFieldLabel);
        return `Изменены поля: ${labels.join(', ')}`;
    }

    if (typeof payload.price !== 'undefined') {
        return `Цена: ${Number(payload.price || 0).toLocaleString('ru-RU')} монет`;
    }

    return String(eventRow?.message || '—');
}


function renderSettingsEventsPages() {
    const root = document.getElementById('settings-events-pages');
    if (!root) return;

    const safeTotalPages = Math.max(1, Number(settingsEventsTotalPages) || 1);
    const safeCurrent = Math.min(Math.max(1, Number(settingsEventsPage) || 1), safeTotalPages);

    if (safeTotalPages <= 1) {
        root.hidden = true;
        root.innerHTML = '';
        return;
    }

    const pages = buildSmallPages(safeTotalPages, safeCurrent);
    root.hidden = false;
    root.innerHTML = pages.map((p) => {
        if (p === '…') return '<span class="games-pages__ellipsis" aria-hidden="true">…</span>';
        const page = Number(p);
        const activeClass = page === safeCurrent ? ' games-pages__btn--active' : '';
        return `<button type="button" class="games-pages__btn${activeClass}" data-page="${page}" aria-label="Страница ${page}" aria-current="${page === safeCurrent ? 'page' : 'false'}">${page}</button>`;
    }).join('');
}


async function loadSettingsEvents(page = settingsEventsPage, limit = settingsEventsPageSize) {
    const settingsBody = document.getElementById('settings-body');
    if (!settingsBody) return;

    const userId = getCurrentUserId();
    if (!userId) {
        settingsBody.innerHTML = '<p class="placeholder">Нет user_id в URL</p>';
        return;
    }

    settingsEventsPage = Math.max(1, Number(page) || 1);

    settingsBody.innerHTML = '<p class="placeholder">Загрузка событий…</p>';

    try {
        const response = await fetch(`/api/events?user_id=${encodeURIComponent(userId)}&page=${settingsEventsPage}&limit=${limit}`);
        if (response.status === 403) {
            settingsBody.innerHTML = '<p class="placeholder">Доступ к разделу есть только у суперадминистраторов.</p>';
            return;
        }
        if (!response.ok) {
            throw new Error(`Не удалось загрузить события (${response.status})`);
        }

        const data = await response.json();
        settingsEventsTotalPages = Math.max(1, Number(data.total_pages) || 1);
        if (settingsEventsPage > settingsEventsTotalPages) settingsEventsPage = settingsEventsTotalPages;

        const rowsList = Array.isArray(data.events) ? data.events : [];
        if (!rowsList.length) {
            settingsBody.innerHTML = '<p class="placeholder">Событий пока нет</p>';
            return;
        }

        const rows = rowsList.map((row) => {
            const dateText = fmtDateTime(row.created_at);
            const actor = row.actor_name_snapshot || 'Система';
            const target = row.target_name_snapshot || '—';
            const eventTypeLabel = formatSettingsEventType(row.event_type);
            const details = esc(renderSettingsEventDetails(row));
            return `
                <tr>
                    <td>${esc(dateText)}</td>
                    <td>${esc(actor)}</td>
                    <td>${esc(eventTypeLabel)}</td>
                    <td>${esc(target)}</td>
                    <td>${details}</td>
                </tr>
            `;
        }).join('');

        settingsBody.innerHTML = `
            <div class="table-wrap">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Дата</th>
                            <th>Кто</th>
                            <th>Событие</th>
                            <th>Объект</th>
                            <th>Детали</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
            <div id="settings-events-pages" class="games-pages" hidden></div>
        `;

        renderSettingsEventsPages();
        const pagesRoot = document.getElementById('settings-events-pages');
        if (pagesRoot && pagesRoot.dataset.init !== '1') {
            pagesRoot.addEventListener('click', (event) => {
                const btn = event.target.closest('.games-pages__btn[data-page]');
                if (!btn) return;
                const nextPage = Number(btn.dataset.page || '1');
                if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage === settingsEventsPage) return;
                loadSettingsEvents(nextPage, settingsEventsPageSize);
            });
            pagesRoot.dataset.init = '1';
        }
    } catch (error) {
        console.error(error);
        settingsBody.innerHTML = '<p class="placeholder">Не удалось загрузить события</p>';
    }
}


async function loadSettingsStickers() {
    const response = await fetch(`/api/stickers`);
    if (!response.ok) {
        throw new Error('Ошибка загрузки стикеров');
    }
    return await response.json();
}


function renderSettingsStickers(stickers) {
    const bodyEl = document.querySelector('#settings-body');
    if (!bodyEl) return;

    if (stickers.length === 0) {
        bodyEl.innerHTML = '<p class="placeholder">Еще нет стикеров</p>';
        return;
    }

    let html = '<div class="stickers-gallery">';

    stickers.forEach(sticker => {
        html += `
            <div class="sticker-item" data-sticker-id="${sticker.id}">
                <img
                    src="${sticker.url}"
                    alt="${sticker.name}"
                    style="width: 128px; height: 128px; object-fit: contain; cursor: pointer;"
                >
                <button
                    type="button"
                    class="settings-sticker-delete-btn"
                    data-sticker-id="${sticker.id}"
                    data-sticker-name="${sticker.name}"
                >
                    ✕
                </button>
            </div>`;
    });

    html += '</div>';

    bodyEl.innerHTML = html;
}


function initStickerCreateModal() {
    const modal = document.getElementById('sticker-create-modal');
    const form = document.getElementById('sticker-create-form');
    const fileInput = document.getElementById('sticker-create-file');
    const previewBlock = document.getElementById('sticker-create-preview');
    const clearBtn = document.getElementById('sticker-create-preview-clear');

    if (!modal || !form || !fileInput || !previewBlock || !clearBtn) {
        console.warn('Sticker modal: required elements not found');
        return;
    }

    const previewImg = previewBlock.querySelector('img');
    const openBtn = document.getElementById('show-sticker-create-modal');

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            modal.hidden = false;
            modal.setAttribute('aria-hidden', 'false');
        });
    } else {
        console.warn('Sticker modal: open button #show-sticker-create-modal not found');
    }

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file && previewImg) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImg.src = e.target.result;
                previewBlock.hidden = false;
            };
            reader.readAsDataURL(file);
        }
    });

    clearBtn.addEventListener('click', () => {
        fileInput.value = '';
        previewBlock.hidden = true;
        if (previewImg) previewImg.src = '';
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Загрузка...';

        try {
            const name = document.getElementById('sticker-create-name').value;
            const file = fileInput.files[0];

            if (!file) {
                toast('Выберите файл!');
                return;
            }

            const uploadResult = await uploadStickerImage(file);
            const serverUrl = uploadResult.url;

            await createStickerRecord(name, serverUrl);

            toast('Стикер успешно создан!');

            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            form.reset();
            previewBlock.hidden = true;
            if (previewImg) previewImg.src = '';

            if (typeof loadSettingsStickers === 'function') {
                const stickers = await loadSettingsStickers();
                renderSettingsStickers(stickers);
            }
        } catch (error) {
            console.error(error);
            alert(`Ошибка: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Создать';
        }
    });

    const closeBtns = modal.querySelectorAll('.modal__close, #sticker-create-cancel, .modal__overlay');
    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault?.();
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            form.reset();
            previewBlock.hidden = true;
            if (previewImg) previewImg.src = '';
        });
    });
}


async function uploadStickerImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/stickers/upload-image', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Ошибка загрузки файла');
    }

    return await response.json();
}


async function createStickerRecord(name, url) {
    const response = await fetch('/api/stickers', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, url })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Ошибка сохранения стикера');
    }

    return await response.json();
}


async function deleteSticker(id) {
    try {
        const response = await fetch(`/api/stickers/${id}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Не удалось удалить стикер');
        }

        toast('Стикер удален');
    } catch (error) {
        console.error('Ошибка удаления стикера:', error);
        toast(`Ошибка: ${error.message}`);
    }
}


async function reloadSettingsStickers() {
    try {
        const stickers = await loadSettingsStickers();
        renderSettingsStickers(stickers);
    } catch (err) {
        console.error('Ошибка при перезагрузке стикеров:', err);
        document.querySelector('#settings-body').innerHTML = '<p class="placeholder">Не удалось загрузить список стикеров</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initHomeSidebarNav();
    initHomeFeedFilters();
    initHomeFeedPager();
    initCompactPurchasesPagination();
    loadCurrentUser();
    openThanksModal();
    document.getElementById('send-thanks-btn')?.addEventListener('click', openThanksComposerOnHome);
    document.getElementById('send-thanks-btn-in-game')?.addEventListener('click', openThanksComposerOnHome);
    const modal = document.getElementById('thanks-modal');
    modal?.querySelector('#thanks-form')?.addEventListener('submit', submitThanks);
    document.getElementById('thanks-inline-reset')?.addEventListener('click', closeThanksModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.contains(document.activeElement)) {
            closeThanksModal();
        }
    });
    document.querySelector('.tabs__button[data-tab="game"]')?.addEventListener('click', () => {
        if (!gamesLoaded) {
            gamesLoaded = true;
            loadGames();
            loadOverallRating();
        }
    });
    if (document.getElementById('game')?.classList.contains('tab-content--active')) {
        gamesLoaded = true;
        loadGames();
        loadOverallRating();
    };
    document.getElementById('active-games-list')?.addEventListener('click', (e) => {
        const target = e.target.closest('[data-active-game-id]');
        if (!target) return;
        e.preventDefault();
        const gameId = Number(target.getAttribute('data-active-game-id') || '0');
        if (!gameId) return;
        const selectedGame = currentActiveGames.find((game) => Number(game.id) === gameId);
        if (selectedGame) {
            openGameModalForGame(selectedGame, { isActive: true });
        }
    });

    const loadMoreBtn = document.getElementById('likes-history-load-more');
    if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      const offset = likesHistoryRows.length;
      loadLikesHistory(likesHistoryLimit, offset, { append: true });
    });
    }

    const gameModal = document.getElementById('game-modal');
    gameModal?.querySelector('#game-modal-close')?.addEventListener('click', closeGameModal);
    gameModal?.querySelector('#game-modal-close-footer')?.addEventListener('click', closeGameModal);
    gameModal?.querySelector('.modal__overlay')?.addEventListener('click', closeGameModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !gameModal?.hidden) { closeGameModal(); } });

    if (window.feather?.replace) feather.replace({ width: 18, height: 18 });

    document.querySelector('.tabs__button[data-tab="shop"]')?.addEventListener('click', () => {
        loadHomePurchases();
        if (!shopLoaded) {
            shopLoaded = true;
            loadShopItems();
        }
    });

    if (document.getElementById('shop')?.classList.contains('tab-content--active')) {
        shopLoaded = true;
        loadHomePurchases();
        loadShopItems();
    }

    const shopRoot = document.getElementById('shop-items');
    if (shopRoot) {
        shopRoot.addEventListener('click', async (event) => {
            const description = event.target.closest('.shop-card__description');
            if (description) {
                const expanded = description.classList.toggle('is-expanded');
                description.setAttribute('aria-expanded', String(expanded));
                description.setAttribute(
                    'title',
                    expanded ? 'Нажмите, чтобы свернуть описание' : 'Нажмите, чтобы развернуть описание'
                );
                return;
            }

            const button = event.target.closest('.shop-card__buy');
            if (!button) return;
            await handlePurchase(button);
        });

        shopRoot.addEventListener('keydown', (event) => {
            const description = event.target.closest('.shop-card__description');
            if (!description) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            description.click();
        });
    }

    initSettingsNav();

    if (document.getElementById('settings')?.classList.contains('tab-content--active')) {
        loadSettingsGames().then(renderSettingsGames).catch(() => {});
    }
    const gameEditModal = document.getElementById('game-edit-modal');
    if (gameEditModal) {
        gameEditModal.querySelector('#game-edit-modal-close')?.addEventListener('click', closeGameEditModal);
        gameEditModal.querySelector('#game-edit-cancel')?.addEventListener('click', (e) => {
            e.preventDefault();
            closeGameEditModal();
        });
        gameEditModal.querySelector('.modal__overlay')?.addEventListener('click', closeGameEditModal);

        gameEditModal.querySelector('#game-edit-form')?.addEventListener('submit', submitGameEditForm);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !gameEditModal.hidden) {
                closeGameEditModal();
            }
        });

        const activeCheckbox = gameEditModal.querySelector('#game-edit-is-active');
        const activeHint = gameEditModal.querySelector('#game-edit-active-hint');

        if (activeCheckbox && activeHint) {
            const toggleHint = () => {
                activeHint.hidden = !activeCheckbox.checked;
            };
            activeCheckbox.addEventListener('change', toggleHint);
        }
    }

    const gameCreateModal = document.getElementById('game-create-modal');
    if (gameCreateModal) {
        const createGameBtn = document.getElementById('create-game-btn');
        createGameBtn?.addEventListener('click', async () => {
            await openGameCreateModal();
        });

        gameCreateModal.querySelector('#game-create-modal-close')?.addEventListener('click', closeGameCreateModal);
        gameCreateModal.querySelector('#game-create-cancel')?.addEventListener('click', (e) => {
            e.preventDefault();
            closeGameCreateModal();
        });
        gameCreateModal.querySelector('.modal__overlay')?.addEventListener('click', closeGameCreateModal);
        gameCreateModal.querySelector('#game-create-form')?.addEventListener('submit', submitGameCreateForm);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !gameCreateModal.hidden) {
                closeGameCreateModal();
            }
        });

        const activeCheckbox = gameCreateModal.querySelector('#game-create-is-active');
        const activeHint = gameCreateModal.querySelector('#game-create-active-hint');
        if (activeCheckbox && activeHint) {
            const toggleHint = () => {
                activeHint.hidden = !activeCheckbox.checked;
            };
            activeCheckbox.addEventListener('change', toggleHint);
        }
    }

    const shopCreateModal = document.getElementById('shop-item-create-modal');
    if (shopCreateModal) {
        const createShopBtn = document.getElementById('create-shop-item-btn');
        createShopBtn?.addEventListener('click', openShopItemCreateModal);

        shopCreateModal
            .querySelector('#shop-item-create-modal-close')
            ?.addEventListener('click', closeShopItemCreateModal);

        shopCreateModal
            .querySelector('#shop-item-create-cancel')
            ?.addEventListener('click', (e) => {
                e.preventDefault();
                closeShopItemCreateModal();
            });

        shopCreateModal
            .querySelector('.modal__overlay')
            ?.addEventListener('click', closeShopItemCreateModal);

        shopCreateModal
            .querySelector('#shop-item-create-form')
            ?.addEventListener('submit', submitShopItemCreateForm);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !shopCreateModal.hidden) {
                closeShopItemCreateModal();
            }
        });
    }

    const shopEditModal = document.getElementById('shop-item-edit-modal');
    if (shopEditModal) {
        shopEditModal
            .querySelector('#shop-item-edit-modal-close')
            ?.addEventListener('click', closeShopItemEditModal);

        shopEditModal
            .querySelector('#shop-item-edit-cancel')
            ?.addEventListener('click', (e) => {
                e.preventDefault();
                closeShopItemEditModal();
            });

        shopEditModal
            .querySelector('.modal__overlay')
            ?.addEventListener('click', closeShopItemEditModal);

        shopEditModal
            .querySelector('#shop-item-edit-form')
            ?.addEventListener('submit', submitShopItemEditForm);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !shopEditModal.hidden) {
                closeShopItemEditModal();
            }
        });
    }

    const updateEmployeesBtn = document.getElementById('update-employees-btn');
    if (updateEmployeesBtn) {
        updateEmployeesBtn.addEventListener('click', updateEmployeesFromBitrix);
    }

    const employeeEditModal = document.getElementById('employee-edit-modal');
    if (employeeEditModal) {
        employeeEditModal
            .querySelector('#employee-edit-modal-close')
            ?.addEventListener('click', closeEmployeeEditModal);

        employeeEditModal
            .querySelector('#employee-edit-cancel')
            ?.addEventListener('click', (e) => {
                e.preventDefault();
                closeEmployeeEditModal();
            });

        employeeEditModal
            .querySelector('.modal__overlay')
            ?.addEventListener('click', closeEmployeeEditModal);

        employeeEditModal
            .querySelector('#employee-edit-form')
            ?.addEventListener('submit', submitEmployeeEditForm);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !employeeEditModal.hidden) {
                closeEmployeeEditModal();
            }
        });
    }

    initTooltips();

    initShopImageModal();

    document.getElementById('prev-page-btn')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadGames();
        }
    });

    document.getElementById('next-page-btn')?.addEventListener('click', () => {
        currentPage++;
        loadGames();
    });

    document.getElementById('overall-rating-prev-btn')?.addEventListener('click', () => {
        if (overallRatingPage > 1) {
            loadOverallRating(overallRatingPage - 1);
        }
    });

    document.getElementById('overall-rating-next-btn')?.addEventListener('click', () => {
        if (overallRatingPage < overallRatingTotalPages) {
            loadOverallRating(overallRatingPage + 1);
        }
    });

    document.getElementById('finished-games-pages')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.games-pages__btn');
        if (!btn) return;
        const page = Number(btn.dataset.page || '1');
        if (!Number.isFinite(page) || page < 1 || page === currentPage) return;
        currentPage = page;
        loadGames();
    });

    document.getElementById('likes-history-prev-page-btn')?.addEventListener('click', () => {
        if (currentLikesPage > 1) {
            currentLikesPage--;
            const offset = (currentLikesPage - 1) * likesHistoryLimit;
            loadLikesHistory(likesHistoryLimit, offset);
        }
    });

    document.getElementById('likes-history-next-page-btn')?.addEventListener('click', () => {
        currentLikesPage++;
        const offset = (currentLikesPage - 1) * likesHistoryLimit;
        loadLikesHistory(likesHistoryLimit, offset);
    });

    initLiveFeed();

    initStickerSelector();
    loadStickerCatalog();

    initStickerCreateModal();


})
