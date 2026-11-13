// --- BASE DE DADOS LOCAL ---
function getDB() { return JSON.parse(localStorage.getItem('neon_db')) || {}; }
function saveDB(db) { localStorage.setItem('neon_db', JSON.stringify(db)); }
let currentUserEmail = localStorage.getItem('current_email') || null;
const ADMIN_PASSWORD = "admin";

function showToast(msg, color = 'var(--accent)') {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.background = color;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// --- PERFIL ---
function updateProfileUI() {
    const db = getDB();
    let name = "Convidado", pts = 1200, wins = 0, losses = 0;

    if (currentUserEmail && db[currentUserEmail]) {
        name = db[currentUserEmail].name;
        pts = db[currentUserEmail].points;
        wins = db[currentUserEmail].wins || 0;
        losses = db[currentUserEmail].losses || 0;
    } else {
        pts = parseInt(localStorage.getItem('guest_points') || '1200');
    }

    const total = wins + losses;
    const winrate = total > 0 ? Math.round((wins / total) * 100) : 0;

    document.getElementById('dash-name').innerText = name;
    document.getElementById('dash-avatar').innerText = name.charAt(0).toUpperCase();
    document.getElementById('dash-rating').innerText = pts;
    document.getElementById('dash-total').innerText = total;
    document.getElementById('dash-winrate').innerText = winrate + '%';
    document.getElementById('dash-wins-text').innerText = wins + ' Vitórias';
    document.getElementById('dash-losses-text').innerText = losses + ' Derrotas';
    document.getElementById('dash-winrate-bar').style.width = winrate + '%';

    document.getElementById('sidebar-avatar').innerText = name.charAt(0).toUpperCase();
    document.getElementById('game-name').innerText = name;
    document.getElementById('game-avatar').innerText = name.charAt(0).toUpperCase();
    document.getElementById('game-rating').innerText = pts;
}

function openLogin() {
    if (currentUserEmail) {
        if (confirm("Terminar sessão?")) {
            currentUserEmail = null;
            localStorage.removeItem('current_email');
            updateProfileUI();
        }
    } else { openModal('login-modal'); }
}

function doLogin() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const name = document.getElementById('login-name').value.trim();
    if (!email || !name) return showToast("Preenche todos os campos", "var(--danger)");

    const db = getDB();
    if (!db[email]) db[email] = { name: name, points: 1200, wins: 0, losses: 0 };
    else if (db[email].name !== name) {
        if(!confirm("Nome diferente. Atualizar?")) return;
        db[email].name = name;
    }

    saveDB(db);
    currentUserEmail = email;
    localStorage.setItem('current_email', email);
    closeModal('login-modal');
    updateProfileUI();
    showToast("Login efetuado!");
}

// --- ADMIN ---
let adminTargetEmail = null;
function openAdminLogin() { openModal('admin-login-modal'); }
function checkAdmin() {
    if (document.getElementById('admin-pass').value === ADMIN_PASSWORD) {
        closeModal('admin-login-modal'); openModal('admin-dashboard');
    } else { showToast("Password Incorreta", "var(--danger)"); }
}

function searchPlayer() {
    const search = document.getElementById('admin-search').value.trim().toLowerCase();
    const db = getDB();
    let found = null;
    for (let email in db) { if (db[email].name.toLowerCase() === search) { found = email; break; } }
    if (found) {
        adminTargetEmail = found;
        document.getElementById('admin-target-name').innerText = db[found].name;
        document.getElementById('admin-target-pts').innerText = db[found].points;
        document.getElementById('admin-result').style.display = 'block';
    } else { showToast("Jogador não encontrado", "var(--danger)"); document.getElementById('admin-result').style.display = 'none'; }
}

function modifyPoints(action) {
    if (!adminTargetEmail) return showToast("Procura um jogador primeiro", "var(--danger)");
    const amt = parseInt(document.getElementById('admin-amount').value);
    if (isNaN(amt) || amt <= 0) return showToast("Quantidade inválida", "var(--danger)");

    const db = getDB();
    if (action === 'add') db[adminTargetEmail].points += amt;
    else db[adminTargetEmail].points = Math.max(0, db[adminTargetEmail].points - amt);
    
    saveDB(db);
    document.getElementById('admin-target-pts').innerText = db[adminTargetEmail].points;
    document.getElementById('admin-amount').value = '';
    if(currentUserEmail === adminTargetEmail) updateProfileUI();
    showToast(`Pontos ${action === 'add' ? 'adicionados' : 'removidos'}!`);
}

// --- MOTOR DE XADREZ E RELÓGIO ---
const boardEl = document.getElementById('board');
let board = new Array(64).fill(null);
let turn = 'w', selectedSquare = null, legalMovesForSelected = [], history = [], moveNumber = 1, isFlipped = false, gameMode = 'pvc', isGameOver = false, enPassantTarget = null, pendingPromotion = null;
let channel = null, myOnlineColor = null, isOnlineGame = false;
let timeWhite = 600, timeBlack = 600, timerInterval = null;

const initialBoard = [
    'r','n','b','q','k','b','n','r', 'p','p','p','p','p','p','p','p',
    null,null,null,null,null,null,null,null, null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null, null,null,null,null,null,null,null,null,
    'P','P','P','P','P','P','P','P', 'R','N','B','Q','K','B','N','R'
];
const pieceValues = { 'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900 };

function initBoard() {
    board = [...initialBoard]; turn = 'w'; selectedSquare = null; legalMovesForSelected = []; history = []; moveNumber = 1; enPassantTarget = null; isGameOver = false;
    timeWhite = 600; timeBlack = 600;
    document.getElementById('move-list').innerHTML = ''; 
    startClock();
    renderBoard(); updateGameStatus();
}

function startClock() {
    if (timerInterval) clearInterval(timerInterval);
    updateClockUI();
    timerInterval = setInterval(() => {
        if (isGameOver) return;
        if (turn === 'w') timeWhite--;
        else timeBlack--;
        
        if (timeWhite <= 0 || timeBlack <= 0) {
            isGameOver = true;
            clearInterval(timerInterval);
            showToast(`Tempo esgotado! Vencedor: ${timeWhite <= 0 ? 'Pretas' : 'Brancas'}`, "var(--danger)");
            updateStats(timeWhite <= 0 ? 'loss' : 'win');
        }
        updateClockUI();
    }, 1000);
}

function updateClockUI() {
    const format = (t) => `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
    const cTop = document.getElementById('clock-top'), cBot = document.getElementById('clock-bottom');
    
    if (isFlipped) {
        cTop.innerText = format(timeWhite);
        cBot.innerText = format(timeBlack);
        cTop.classList.toggle('active', turn === 'w');
        cBot.classList.toggle('active', turn === 'b');
    } else {
        cTop.innerText = format(timeBlack);
        cBot.innerText = format(timeWhite);
        cTop.classList.toggle('active', turn === 'b');
        cBot.classList.toggle('active', turn === 'w');
    }
}

function startGame(mode) {
    gameMode = mode;
    switchView('play-view');
    if (timerInterval) clearInterval(timerInterval);

    if (mode === 'online') {
        isOnlineGame = true;
        document.getElementById('opp-name').innerText = "À espera...";
        channel = new BroadcastChannel('neon_platform_premium');
        channel.postMessage({ type: 'searching' });
        channel.onmessage = (e) => {
            const d = e.data;
            if (d.type === 'searching' && !myOnlineColor) {
                myOnlineColor = 'white'; 
                channel.postMessage({ type: 'match_found', color: 'black', name: "Oponente" }); 
                startOnline("Oponente");
            } else if (d.type === 'match_found') {
                myOnlineColor = d.color; startOnline(d.name || "Oponente");
            } else if (d.type === 'move' && isOnlineGame) {
                applyOnlineMove(d.move);
            } else if (d.type === 'resign') {
                isGameOver = true; showToast("Oponente desistiu. Ganhaste!", "var(--success)"); updateStats('win');
            }
        };
    } else {
        isOnlineGame = false;
        document.getElementById('opp-name').innerText = "Computador (IA)";
        document.getElementById('opp-rating').innerText = "1500 ELO (Casual)";
        isFlipped = false;
        initBoard();
    }
}

function startOnline(oppName) {
    document.getElementById('opp-name').innerText = oppName;
    document.getElementById('opp-rating').innerText = "Ranked";
    if (myOnlineColor === 'black') isFlipped = true;
    initBoard();
}

function applyOnlineMove(m) {
    board[m.to] = m.piece; board[m.from] = null; turn = turn === 'w' ? 'b' : 'w';
    renderBoard(); checkGameState(); updateClockUI();
}

function getPseudoMoves(pos, piece, cb, ep) {
    let moves = []; const row = Math.floor(pos / 8), col = pos % 8, isW = piece === piece.toUpperCase();
    const add = (r, c) => {
        if (r >= 0 && r < 8 && c >= 0 && c < 8) {
            const tPos = r * 8 + c, tPiece = cb[tPos];
            if (!tPiece || (isW ? tPiece === tPiece.toLowerCase() : tPiece === tPiece.toUpperCase())) moves.push({ from: pos, to: tPos, piece, captured: tPiece });
        }
    };
    const p = piece.toLowerCase();
    if (p === 'p') {
        const dir = isW ? -1 : 1, start = isW ? 6 : 1;
        if (row + dir >= 0 && row + dir < 8 && !cb[(row + dir) * 8 + col]) {
            moves.push({ from: pos, to: (row + dir) * 8 + col, piece });
            if (row === start && !cb[(row + 2 * dir) * 8 + col]) moves.push({ from: pos, to: (row + 2 * dir) * 8 + col, piece });
        }
        for (const dc of [-1, 1]) {
            if (col + dc >= 0 && col + dc < 8) {
                const tPos = (row + dir) * 8 + (col + dc);
                if (row + dir >= 0 && row + dir < 8) {
                    const tPiece = cb[tPos];
                    if (tPiece && (isW ? tPiece === tPiece.toLowerCase() : tPiece === tPiece.toUpperCase())) moves.push({ from: pos, to: tPos, piece, captured: tPiece });
                    if (tPos === ep) moves.push({ from: pos, to: tPos, piece, captured: isW ? 'p' : 'P', isEnPassant: true });
                }
            }
        }
    } else if (p === 'n') { [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => add(row + dr, col + dc)); }
    else if (p === 'b' || p === 'r' || p === 'q') {
        const dirs = [];
        if (p === 'b' || p === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
        if (p === 'r' || p === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
        for (let [dr, dc] of dirs) {
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                const tPos = r * 8 + c, tPiece = cb[tPos];
                if (!tPiece) moves.push({ from: pos, to: tPos, piece });
                else {
                    if (isW ? tPiece === tPiece.toLowerCase() : tPiece === tPiece.toUpperCase()) moves.push({ from: pos, to: tPos, piece, captured: tPiece });
                    break;
                }
                r += dr; c += dc;
            }
        }
    } else if (p === 'k') { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr !== 0 || dc !== 0) add(row + dr, col + dc); }
    return moves;
}

function getLegalMoves(pos, piece, cb, ep) {
    return getPseudoMoves(pos, piece, cb, ep).filter(m => {
        const tb = [...cb]; tb[m.to] = piece; tb[m.from] = null;
        if (m.isEnPassant) tb[piece === piece.toUpperCase() ? m.to + 8 : m.to - 8] = null;
        return !isCheck(piece === piece.toUpperCase() ? 'w' : 'b', tb);
    });
}

function isCheck(color, cb) {
    const k = color === 'w' ? 'K' : 'k', pos = cb.indexOf(k);
    if (pos === -1) return false;
    const e = color === 'w' ? 'b' : 'w';
    for (let i = 0; i < 64; i++) {
        const p = cb[i];
        if (p && (e === 'w' ? p === p.toUpperCase() : p === p.toLowerCase())) {
            if (getPseudoMoves(i, p, cb, null).some(m => m.to === pos)) return true;
        }
    }
    return false;
}

function checkGameState() {
    let hasMoves = false;
    for (let i = 0; i < 64; i++) {
        const p = board[i];
        if (p && (turn === 'w' ? p === p.toUpperCase() : p === p.toLowerCase())) {
            if (getLegalMoves(i, p, board, enPassantTarget).length > 0) { hasMoves = true; break; }
        }
    }
    if (!hasMoves) {
        isGameOver = true;
        clearInterval(timerInterval);
        if (isCheck(turn, board)) {
            const winColor = turn === 'w' ? 'Pretas' : 'Brancas';
            showToast(`Xeque-Mate! Vitória das ${winColor}`, "var(--success)");
            updateStats(turn === 'w' ? 'loss' : 'win');
        } else {
            showToast("Empate (Afogamento)");
        }
    }
    updateGameStatus();
}

function updateGameStatus() {
    document.getElementById('game-status').innerText = isGameOver ? "Fim de Jogo" : `Vez das ${turn === 'w' ? 'Brancas' : 'Pretas'}`;
}

function renderBoard() {
    boardEl.innerHTML = '';
    const inCheck = !isGameOver && isCheck(turn, board);
    const kPos = board.indexOf(turn === 'w' ? 'K' : 'k');
    
    for (let i = 0; i < 64; i++) {
        const act = isFlipped ? (63 - i) : i;
        const r = Math.floor(act / 8), c = act % 8;
        const sq = document.createElement('div');
        sq.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        
        sq.setAttribute('data-file', String.fromCharCode(97 + c));
        sq.setAttribute('data-rank', 8 - r);

        if (selectedSquare === act) sq.style.backgroundColor = 'rgba(59, 130, 246, 0.5)';
        
        if (history.length > 0) {
            const last = history[history.length-1];
            if (last && (last.from === act || last.to === act)) sq.classList.add('last-move');
        }
        
        const move = legalMovesForSelected.find(m => m.to === act);
        if (move) sq.classList.add(move.captured ? 'highlight-capture' : 'highlight-dot');
        if (inCheck && act === kPos) sq.classList.add('in-check');
        
        const p = board[act];
        if (p) sq.innerHTML = `<span class="piece ${p === p.toUpperCase() ? 'piece-w' : 'piece-b'}">${getPieceChar(p)}</span>`; 
        
        sq.onclick = () => handleSquareClick(act);
        boardEl.appendChild(sq);
    }
}

function getPieceChar(p) {
    const style = localStorage.getItem('pieceStyle') || 'classic';
    const THEMES = {
        classic: { 'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙', 'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' },
        modern: { 'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟', 'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' },
        outline: { 'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙', 'k': '♔', 'q': '♕', 'r': '♖', 'b': '♗', 'n': '♘', 'p': '♙' },
        letters: { 'K': 'K', 'Q': 'Q', 'R': 'R', 'B': 'B', 'N': 'N', 'P': 'P', 'k': 'k', 'q': 'q', 'r': 'r', 'b': 'b', 'n': 'n', 'p': 'p' }
    };
    return THEMES[style][p] || p;
}

function handleSquareClick(idx) {
    if (isGameOver || (isOnlineGame && turn !== myOnlineColor) || (gameMode === 'pvc' && turn === 'b')) return;
    const clicked = board[idx];
    if (selectedSquare !== null) {
        const move = legalMovesForSelected.find(m => m.to === idx);
        if (move) { executeMove(move); return; }
    }
    if (clicked) {
        const isW = clicked === clicked.toUpperCase();
        if ((turn === 'w' && isW) || (turn === 'b' && !isW)) {
            selectedSquare = idx; legalMovesForSelected = getLegalMoves(idx, clicked, board, enPassantTarget);
        } else { selectedSquare = null; legalMovesForSelected = []; }
    } else { selectedSquare = null; legalMovesForSelected = []; }
    renderBoard();
}

function executeMove(move) {
    const isPawn = move.piece.toLowerCase() === 'p';
    const isProm = (move.piece === 'P' && Math.floor(move.to / 8) === 0) || (move.piece === 'p' && Math.floor(move.to / 8) === 7);
    if (isPawn && isProm) { pendingPromotion = move; openModal('promo-modal'); return; }
    finalizeMove(move);
}

function selectPromotion(type) {
    closeModal('promo-modal');
    if (pendingPromotion) {
        pendingPromotion.piece = pendingPromotion.piece === 'P' ? type.toUpperCase() : type.toLowerCase();
        finalizeMove(pendingPromotion); pendingPromotion = null;
    }
}

function finalizeMove(move) {
    history.push({ board: [...board], turn, enPassantTarget });
    board[move.to] = move.piece; board[move.from] = null;
    if (move.isEnPassant) board[move.piece === 'P' ? move.to + 8 : move.to - 8] = null;
    enPassantTarget = null;
    if (move.piece.toLowerCase() === 'p' && Math.abs(move.to - move.from) === 16) enPassantTarget = (move.to + move.from) / 2;

    const note = `${move.piece.toUpperCase()}${String.fromCharCode(97 + (move.from % 8))}${8 - Math.floor(move.from / 8)}-${String.fromCharCode(97 + (move.to % 8))}${8 - Math.floor(move.to / 8)}`;
    
    if (turn === 'b') { 
        const li = document.createElement('li'); 
        li.innerHTML = `<span class="num">${moveNumber}.</span> <span class="move">${note}</span>`; 
        document.getElementById('move-list').appendChild(li); moveNumber++; 
    } else {
        const last = document.getElementById('move-list').lastElementChild;
        if (last) last.innerHTML += ` <span class="move">${note}</span>`;
        else { const li = document.createElement('li'); li.innerHTML = `<span class="num">${moveNumber}.</span> <span class="move">...</span> <span class="move">${note}</span>`; document.getElementById('move-list').appendChild(li); }
    }

    turn = turn === 'w' ? 'b' : 'w'; selectedSquare = null; legalMovesForSelected = [];
    renderBoard(); checkGameState(); updateClockUI();

    if (isOnlineGame && channel) channel.postMessage({ type: 'move', move: move });
    
    // IA (Apenas no modo Casual/PvC)
    if (gameMode === 'pvc' && turn === 'b' && !isGameOver) {
        setTimeout(makeAIMove, 500);
    }
}

function toggleHistoryMobile() { document.getElementById('game-sidebar').classList.toggle('open'); }

let confirmCallback = null;
function showConfirm(title, msg, callback) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-msg').innerText = msg;
    openModal('confirm-modal');
    confirmCallback = callback;
}
function closeConfirm(isOk) {
    closeModal('confirm-modal');
    if (confirmCallback) { if (isOk) confirmCallback(); confirmCallback = null; }
}

function askNewGame() { showConfirm("Novo Jogo", "Queres reiniciar a partida?", () => initBoard()); }

function askResign() {
    if (isGameOver) return;
    showConfirm("Desistir", "Tens a certeza? Vais perder.", () => {
        isGameOver = true;
        clearInterval(timerInterval);
        if (isOnlineGame && channel) channel.postMessage({ type: 'resign' });
        updateStats('loss');
        showToast("Desististe. Derrota.", "var(--danger)");
    });
}

function updateStats(result) {
    const db = getDB();
    if (currentUserEmail && db[currentUserEmail]) {
        if (result === 'win') { db[currentUserEmail].points += 20; db[currentUserEmail].wins++; }
        if (result === 'loss') { db[currentUserEmail].points = Math.max(0, db[currentUserEmail].points - 15); db[currentUserEmail].losses++; }
        saveDB(db); updateProfileUI();
    } else {
        let pts = parseInt(localStorage.getItem('guest_points') || '1200');
        if (result === 'win') pts += 20;
        if (result === 'loss') pts = Math.max(0, pts - 15);
        localStorage.setItem('guest_points', pts);
        updateProfileUI();
    }
}

// --- INTELIGÊNCIA ARTIFICIAL (MINIMAX BÁSICO) ---
function makeAIMove() {
    if (isGameOver) return;
    let best = null, bestScore = -Infinity;
    
    for (let i = 0; i < 64; i++) {
        const p = board[i];
        if (p && p === p.toLowerCase()) { // Peças pretas
            const moves = getLegalMoves(i, p, board, enPassantTarget);
            for (let m of moves) {
                const tb = [...board]; tb[m.to] = m.piece; tb[m.from] = null;
                if (m.isEnPassant) tb[m.to - 8] = null;
                
                let sc = evalBoard(tb);
                if (isCheck('b', tb)) sc -= 50; // Penaliza se o rei ficar em xeque
                sc += Math.random() * 10; // Aleatoriedade para não ser sempre igual
                
                if (sc > bestScore) { bestScore = sc; best = m; }
            }
        }
    }
    if (best) executeMove(best);
}

function evalBoard(cb) {
    let sc = 0;
    for (let p of cb) {
        if (p) {
            const v = pieceValues[p.toLowerCase()];
            if (p === p.toLowerCase()) sc += v; // Pontos para pretas
            else sc -= v; // Pontos para brancas
        }
    }
    return sc;
}

// --- DEFINIÇÕES E TEMAS ---
function applySettings() {
    const ui = document.getElementById('set-theme').value;
    const pStyle = document.getElementById('set-pieces').value;
    const bStyle = document.getElementById('set-board').value;
    
    localStorage.setItem('uiTheme', ui);
    localStorage.setItem('pieceStyle', pStyle);
    localStorage.setItem('boardStyle', bStyle);

    if (ui === 'light') document.body.classList.add('light-mode');
    else document.body.classList.remove('light-mode');

    const boards = {
        classic: { light: '#ebecd0', dark: '#779556' },
        dark: { light: '#2a2a30', dark: '#101014' },
        cyberpunk: { light: '#2b3b52', dark: '#0f1620' },
        emerald: { light: '#e0f2f1', dark: '#4db6ac' },
        purple: { light: '#f3e5f5', dark: '#ab47bc' }
    };

    document.documentElement.style.setProperty('--board-light', boards[bStyle].light);
    document.documentElement.style.setProperty('--board-dark', boards[bStyle].dark);
    
    if (board.length > 0) renderBoard();
}

function loadSettings() {
    document.getElementById('set-theme').value = localStorage.getItem('uiTheme') || 'dark';
    document.getElementById('set-pieces').value = localStorage.getItem('pieceStyle') || 'classic';
    document.getElementById('set-board').value = localStorage.getItem('boardStyle') || 'classic';
    applySettings();
}

window.addEventListener('DOMContentLoaded', () => {
    initBoard();
    loadSettings();
    updateProfileUI();
});