
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


async function loadCurrentUser() {
    try {
        const userId = getCurrentUserId();
        if (!userId) {
            toast('Нет user_id в URL');
            return;
        }

        const res = await fetch(`/api/user?user_id=${encodeURIComponent(userId)}`);
        if (!res.ok) {
            throw new Error(`Не удалось загрузить пользователя (${res.status})`);
        }
        const u = await res.json();
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v ?? '—';
        };
        const fullName = [u.name, u.lastname].filter(Boolean).join(' ');
        set('user-fullname', fullName || '—');
        set('current_user-thanks', Number(u.likes ?? 0).toLocaleString('ru-RU'));
        set('current_user-balance', Number(u.coins ?? 0).toLocaleString('ru-RU'));

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
        initPurchasesHistory();
        loadPurchasesHistory();
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


async function fetchLikesInfo(bitrixId) {
    const res = await fetch(`/api/likes-info/${encodeURIComponent(bitrixId)}`);
    if (!res.ok) {
        let msg = `Не удалось получить информацию о Спасибках (${res.status})`;
        try {
            const data = await res.json();
            if (data && data.detail) msg = data.detail;
        } catch (_) {}
        throw new Error(msg);
    }
    return res.json();
}


async function openThanksModal() {
    const modal = document.getElementById('thanks-modal');
    const select = modal?.querySelector('#thanks-to');
    const dropdown = modal?.querySelector('#thanks-to-dropdown');
    const trigger = dropdown?.querySelector('.thanks-to-dropdown__trigger');
    const list = dropdown?.querySelector('.thanks-to-dropdown__list');

    if (!modal || !select || !dropdown || !trigger || !list) return;

    select.innerHTML = '<option value="" disabled selected>Загрузка…</option>';
    trigger.textContent = 'Загрузка…';
    trigger.setAttribute('aria-expanded', 'false');
    list.hidden = true;
    list.innerHTML = '';

    const userId = getCurrentUserId();

    try {
        const users = await fetchUsers();

        const selectOptions = ['<option value="" disabled selected>Выберите сотрудника…</option>']
            .concat(
                users.map(u => {
                    const label = [u.name, u.lastname].filter(Boolean).join(' ');
                    const dis = userId && String(u.bitrix_id) === String(userId) ? ' disabled' : '';
                    return `<option value="${u.bitrix_id}"${dis}>${label}</option>`;
                })
            );
        select.innerHTML = selectOptions.join('');

        list.innerHTML = users.map(u => {
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

        trigger.textContent = 'Выберите сотрудника…';

        if (!trigger.dataset.dropdownInit) {
            trigger.addEventListener('click', () => {
                const isOpen = !list.hidden;
                list.hidden = isOpen;
                trigger.setAttribute('aria-expanded', String(!isOpen));
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
                list.hidden = true;
                trigger.setAttribute('aria-expanded', 'false');
            });

            document.addEventListener('click', (event) => {
                if (!modal.contains(event.target)) return;
                if (!dropdown.contains(event.target)) {
                    list.hidden = true;
                    trigger.setAttribute('aria-expanded', 'false');
                }
            });

            trigger.dataset.dropdownInit = '1';
        }

    } catch (e) {
        console.error(e);
        toast(e.message || 'Ошибка загрузки сотрудников');
        trigger.textContent = 'Ошибка загрузки';
        list.hidden = true;
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
}


function closeThanksModal() {
    const modal = document.getElementById('thanks-modal');
    if (!modal) return;

    const msgInput = modal.querySelector('#thanks-message');
    if (msgInput) msgInput.value = '';

    const toInput = modal.querySelector('#thanks-to');
    if (toInput) toInput.value = '0';

    const dropdownTrigger = modal.querySelector('.thanks-to-dropdown__trigger');
    if (dropdownTrigger) dropdownTrigger.textContent = 'Загрузка…';

    const selectedInput = modal.querySelector('#selected-sticker-id');
    if (selectedInput) selectedInput.value = '';

    const allStickerButtons = modal.querySelectorAll('.sticker-item');
    allStickerButtons.forEach(btn => {
        btn.classList.remove('sticker-item--active');
    });

    const stickerToggle = modal.querySelector('#sticker-selector-toggle');
    if (stickerToggle) stickerToggle.textContent = 'Выберите стикер';

    modal.setAttribute('aria-hidden', 'true');
    modal.hidden = true;
}


async function submitThanks(e) {
    e.preventDefault();
    const modal = document.getElementById('thanks-modal');
    const toId = Number(modal.querySelector('#thanks-to')?.value || '0');
    const fromId = Number(getCurrentUserId() || '0');
    const stickerId = Number(modal.querySelector('#selected-sticker-id')?.value || '0');
    if (!toId || toId === fromId) {
        toast('Выберите получателя');
        return;
    }
    const msg = (modal.querySelector('#thanks-message')?.value || '').trim();
    const payload = { from_id: fromId, to_id: toId };
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
        await loadLikesHistory();
        await refreshGameLikesInfo();
        await loadLiveFeedHistory();
        await loadOverallRating();
        await loadPurchasesHistory();
        await loadCurrentUser();

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


function esc(s) {
    return String(s ?? '').replace(/[&<>\"']/g, m => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
}


let gamesLoaded = false;
let currentActiveGame = null;
let finishedGames = [];
let currentPage = 1;
const itemsPerPage = 5;


function updatePagination(totalPages) {
    const prevButton = document.getElementById('prev-page-btn');
    const nextButton = document.getElementById('next-page-btn');
    const currentPageSpan = document.getElementById('current-page');

    currentPageSpan.textContent = `Страница ${currentPage}`;

    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;
}


async function loadGames() {
    try {
        const [activeRes, finishedRes] = await Promise.all([
            fetch(`/api/games?is_active=true&page=${currentPage}&limit=${itemsPerPage}`),
            fetch(`/api/games?is_active=false&page=${currentPage}&limit=${itemsPerPage}`)
        ]);
        if (!activeRes.ok) throw new Error(`Не удалось загрузить активную игру (${activeRes.status})`);
        if (!finishedRes.ok) throw new Error(`Не удалось загрузить завершённые игры (${finishedRes.status})`);

        const activeGames = await activeRes.json();
        const finishedGamesData = await finishedRes.json();

        currentActiveGame = activeGames[0] || null;
        finishedGames = finishedGamesData.games;
        const totalPages = finishedGamesData.total_pages;

        await renderActiveGame(activeGames.games);
        renderFinishedGames(finishedGamesData.games);

        updatePagination(totalPages);
    } catch (e) {
        console.error(e);
        toast(e.message || 'Ошибка загрузки игр');
        renderActiveGame([]);
        renderFinishedGames([]);
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
    const container = document.getElementById('game-stats-container');
    if (!container) return;

    container.hidden = true;

    const userId = getCurrentUserId();
    if (!userId) return;

    try {
        const likesInfo = await fetchLikesInfo(userId);

        if (likesInfo && likesInfo.received_likes !== null && likesInfo.received_likes !== undefined) {
            document.getElementById('game-thanks-received').textContent =
                `Получено Спасибок в текущей игре: ${likesInfo.received_likes ?? 0}`;
            document.getElementById('game-thanks-limit').textContent =
                `Остаток Спасибок в текущей игре: ${likesInfo.remaining_likes ?? 0}`;

            container.hidden = false;
        }
    } catch (e) {
        console.error(e);
    }
}


async function renderActiveGame(rows) {
    const link       = document.getElementById('active-game-link');
    const empty      = document.getElementById('active-game-empty');

    const statsContainer = document.getElementById('game-stats-container');
    const receivedEl = document.getElementById('game-thanks-received');
    const limitEl    = document.getElementById('game-thanks-limit');

    if (!link || !empty || !receivedEl || !limitEl || !statsContainer) return;

    if (!rows || !rows.length) {
        currentActiveGame = null;
        link.hidden = true;
        link.textContent = '';
        empty.hidden = false;
        statsContainer.hidden = true;

        receivedEl.textContent = 'Получено Спасибок в текущей игре: —';
        limitEl.textContent    = 'Остаток Спасибок в текущей игре: —';
        return;
    }

    const g = rows[0];
    currentActiveGame = g;

    link.textContent = g.name || 'Без названия';
    link.hidden = false;
    empty.hidden = true;
    statsContainer.hidden = false;

    receivedEl.textContent = 'Получено Спасибок в текущей игре: …';
    limitEl.textContent    = 'Остаток Спасибок в текущей игре: …';

    const userId = getCurrentUserId();
    if (!userId) {
        receivedEl.textContent = 'Получено Спасибок в текущей игре: —';
        limitEl.textContent    = 'Остаток Спасибок в текущей игре: —';
        return;
    }

    try {
        const likesInfo = await fetchLikesInfo(userId);

        receivedEl.textContent =
            `Получено Спасибок в текущей игре: ${likesInfo.received_likes ?? 0}`;
        limitEl.textContent =
            `Остаток Спасибок в текущей игре: ${likesInfo.remaining_likes ?? 0}`;

    } catch (e) {
        console.error(e);
        toast(e.message || 'Не удалось получить информацию о Спасибках');
        receivedEl.textContent = 'Получено Спасибок в текущей игре: —';
        limitEl.textContent    = 'Остаток Спасибок в текущей игре: —';
    }
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

    const emptyMessage = containerId === 'overall-rating-container'
        ? 'В общем рейтинге ещё нет Спасибок'
        : 'В этой игре ещё нет Спасибок';

    if (!rows || !rows.length) {
        root.innerHTML = `<p class="game-rating__empty">${emptyMessage}</p>`;
        return;
    }

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
const overallRatingLimit = 5;
let overallRatingTotalPages = 1;


async function loadOverallRating(page = overallRatingPage) {
    const containerId = 'overall-rating-container';
    const root = document.getElementById(containerId);

    const prevBtn = document.getElementById('overall-rating-prev-btn');
    const nextBtn = document.getElementById('overall-rating-next-btn');
    const pageSpan = document.getElementById('overall-rating-current-page');

    if (!root || !prevBtn || !nextBtn || !pageSpan) return;

    overallRatingPage = page;

    root.innerHTML = '<p class="game-rating__loading">Загружаем общий рейтинг…</p>';

    try {
        const res = await fetch(
            `/api/rating/overall?page=${overallRatingPage}&limit=${overallRatingLimit}`
        );

        if (!res.ok) {
            throw new Error(`Не удалось загрузить общий рейтинг (${res.status})`);
        }

        const data = await res.json();
        const rows = data.rating;
        overallRatingTotalPages = data.total_pages;

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
        root.innerHTML = '<p class="shop-empty">Еще нет доступных товаров</p>';
        return;
    }

    root.innerHTML = items.map(item => `
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
                <p class="shop-card__description">
                    ${esc(item.description || 'Без описания')}
                </p>
                <p class="shop-card__price">
                    Цена: ${Number(item.price ?? 0).toLocaleString('ru-RU')}
                </p>
                <p class="shop-card__stock">
                    Остаток: ${item.stock ?? 0}
                </p>
                <button
                    class="btn btn--primary btn--tiny shop-card__buy"
                    type="button"
                    data-item-id="${item.id}"
                    data-item-price="${item.price}"
                >
                    Купить
                </button>
            </div>
        </article>
    `).join('');
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


async function handlePurchase(button) {
    const itemId = button.getAttribute('data-item-id');
    const itemPriceRaw = button.getAttribute('data-item-price');

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

        const result = await response.json();
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

        const balanceEl = document.getElementById('current_user-balance');
        if (balanceEl) {
            const normalized = balanceEl.textContent
                .replace(/\s/g, '')
                .replace(/\u00A0/g, '');
            const currentBalance = parseInt(normalized || '0', 10);
            const newBalance = Math.max(currentBalance - itemPrice, 0);
            balanceEl.textContent = newBalance.toLocaleString('ru-RU');
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
        content.innerHTML = '<p class="placeholder">Игр еще нет</p>';
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
                loadPurchasesForSettings();
            } catch (err) {
                bodyEl.innerHTML = '<p class="placeholder">Не удалось загрузить историю покупок</p>';
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
        openGameEditModal(game);
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


function openGameEditModal(game) {
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

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Сохраняем...';
        }

        const res = await fetch(`/api/games/${currentEditingGameId}`, {
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


function openGameCreateModal() {
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

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Создаём...';
        }

        const res = await fetch('/api/games', {
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
        const res = await fetch(`/api/games/${gameId}`, {
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

        const res = await fetch('/api/items', {
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
        const res = await fetch(`/api/items/${id}`, {
            method: 'DELETE',
        });

        if (!res.ok) {
            let msg = `Ошибка удаления товара (${res.status})`;
            try {
                const data = await res.json();
                if (data?.detail) msg = data.detail;
            } catch (_) {
            }
            throw new Error(msg);
        }

        toast('Товар удалён');
        await reloadSettingsItems();
        await loadShopItems();
    } catch (err) {
        console.error(err);
        toast(err.message || 'Не удалось удалить товар');
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

        const res = await fetch(`/api/items/${currentEditingItemId}`, {
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
        const likes = (u.likes != null) ? Number(u.likes).toLocaleString('ru-RU') : '0';
        const avatarHtml = `
            <span class="settings-employee__avatar">
                ${u.photo_url ? `<img src="${u.photo_url}" alt="">` : ''}
            </span>
        `;

        return `
            <tr>
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

    let activeButton = null;

    toggleBtn.textContent = 'Выберите стикер';

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

        if (activeButton === button) {
            button.classList.remove('sticker-item--active');
            activeButton = null;
            selectedInput.value = '';
            toggleBtn.textContent = 'Стикер не выбран';
            return;
        }

        if (activeButton) {
            activeButton.classList.remove('sticker-item--active');
        }

        button.classList.add('sticker-item--active');
        activeButton = button;

        const selectedId = button.dataset.id;
        selectedInput.value = selectedId;

        const name = button.dataset.name || 'Стикер выбран';
        toggleBtn.textContent = name;

        selectorContainer.setAttribute('hidden', '');
        toggleBtn.setAttribute('aria-expanded', 'false');
    });
}


async function loadPurchasesForSettings(page = 1, limit = 10) {
    const settingsBody = document.getElementById("settings-body");
    if (!settingsBody) return;

    settingsBody.innerHTML = `
        <p class="placeholder">Загрузка истории покупок…</p>
    `;

    try {
        const response = await fetch(`/api/purchases?page=${page}&limit=${limit}`);
        if (!response.ok) {
            throw new Error("Не удалось загрузить покупки");
        }

        const data = await response.json();

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
                    <td>${Number(p.amount_spent).toLocaleString('ru-RU')} ❤</td>
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
        `;

    } catch (error) {
        console.error(error);
        settingsBody.innerHTML = `
            <p class="placeholder">Не удалось загрузить историю покупок</p>
        `;
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
        bodyEl.innerHTML = '<p class="placeholder">В каталоге нет стикеров.</p>';
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
    loadCurrentUser();
    initLikesFilters();
    reloadLikesHistory();
    document.getElementById('send-thanks-btn')?.addEventListener('click', openThanksModal);
    document.getElementById('send-thanks-btn-in-game')?.addEventListener('click', openThanksModal);
    const modal = document.getElementById('thanks-modal');
    modal?.querySelector('#thanks-modal-close')?.addEventListener('click', closeThanksModal);
    modal?.querySelector('#thanks-modal-cancel')?.addEventListener('click', closeThanksModal);
    modal?.querySelector('.modal__overlay')?.addEventListener('click', closeThanksModal);
    modal?.querySelector('#thanks-form')?.addEventListener('submit', submitThanks);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal?.hidden) closeThanksModal(); });
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
    document.getElementById('active-game-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentActiveGame) {
            openGameModalForGame(currentActiveGame, { isActive: true });
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
        if (!shopLoaded) {
            shopLoaded = true;
            loadShopItems();
        }
    });

    if (document.getElementById('shop')?.classList.contains('tab-content--active')) {
        shopLoaded = true;
        loadShopItems();
    }

    const shopRoot = document.getElementById('shop-items');
    if (shopRoot) {
        shopRoot.addEventListener('click', async (event) => {
            const button = event.target.closest('.shop-card__buy');
            if (!button) return;
            await handlePurchase(button);
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
        createGameBtn?.addEventListener('click', openGameCreateModal);

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

    document.getElementById('prev-page-btn').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadGames();
        }
    });

    document.getElementById('next-page-btn').addEventListener('click', () => {
        currentPage++;
        loadGames();
    });

    document.getElementById('likes-history-prev-page-btn').addEventListener('click', () => {
        if (currentLikesPage > 1) {
            currentLikesPage--;
            const offset = (currentLikesPage - 1) * likesHistoryLimit;
            loadLikesHistory(likesHistoryLimit, offset);
        }
    });

    document.getElementById('likes-history-next-page-btn').addEventListener('click', () => {
        currentLikesPage++;
        const offset = (currentLikesPage - 1) * likesHistoryLimit;
        loadLikesHistory(likesHistoryLimit, offset);
    });

    initLiveFeed();

    initStickerSelector();
    loadStickerCatalog();

    initStickerCreateModal();


})







