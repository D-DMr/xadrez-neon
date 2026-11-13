let channel = null;
let myOnlineColor = null;
let isOnlineGame = false;
let isWaitingForMatch = false;

const boardEl = document.getElementById('board');
const turnText = document.getElementById('turn-text');
const turnDot = document.getElementById('turn-dot');
const moveListEl = document.getElementById('move-list');
const victoryScreen = document.getElementById('victory-screen');
const victorySubtitle = document.getElementById('victory-subtitle');

let board = new Array(64).fill(null);
let turn = 'w';
let selectedSquare = null;
let legalMovesForSelected = [];
let history = [];
let algebraicHistory = [];
let moveNumber = 1;
let isFlipped = false;
let gameMode = 'pvc';
let isGameOver = false;
let enPassantTarget = null;
let pendingPromotion = null;
let fireworksInterval = null;
let animationId = null;

const initialBoard = [
    'r','n','b','q','k','b','n','r',
    'p','p','p','p','p','p','p','p',
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    'P','P','P','P','P','P','P','P',
    'R','N','B','Q','K','B','N','R'
];

const pieceValues = { 'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900 };

function initBoard() {
    board = [...initialBoard];
    turn = 'w';
    selectedSquare = null;
    legalMovesForSelected = [];
    history = [];
    algebraicHistory = [];
    moveNumber = 1;
    enPassantTarget = null;
    isGameOver = false;
    moveListEl.innerHTML = '';
    victoryScreen.style.display = 'none';
    if (fireworksInterval) clearInterval(fireworksInterval);
    if (animationId) cancelAnimationFrame(animationId);
    updateUI();
    renderBoard();
}

function startGame(mode) {
    gameMode = mode;
    document.getElementById('menu-screen').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('menu-screen').style.display = 'none';
        if (mode === 'online') {
            isOnlineGame = true;
            document.getElementById('waiting-screen').style.display = 'flex';
            startOnlineMatchmaking();
        } else {
            isOnlineGame = false;
            document.getElementById('game-container').style.display = 'flex';
            initBoard();
        }
    }, 400);
}

function startOnlineMatchmaking() {
    isWaitingForMatch = true;
    channel = new BroadcastChannel('neon_chess_lobby');
    channel.postMessage({ type: 'searching' });

    channel.onmessage = (event) => {
        const data = event.data;
        if (data.type === 'searching' && isWaitingForMatch) {
            myOnlineColor = 'white'; 
            isWaitingForMatch = false;
            channel.postMessage({ type: 'match_found', color: 'black' }); 
            startOnlineBoard();
        } else if (data.type === 'match_found' && isWaitingForMatch) {
            myOnlineColor = data.color;
            isWaitingForMatch = false;
            startOnlineBoard();
        } else if (data.type === 'move' && isOnlineGame) {
            applyOnlineMove(data.move);
        } else if (data.type === 'reset' && isOnlineGame) {
            initBoard();
        }
    };
}

function startOnlineBoard() {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    if (myOnlineColor === 'black') isFlipped = true;
    initBoard();
}

function cancelMatchmaking() {
    if (channel) { channel.close(); channel = null; }
    isWaitingForMatch = false;
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'flex';
    document.getElementById('menu-screen').style.opacity = '1';
}

function applyOnlineMove(move) {
    board[move.to] = move.piece;
    board[move.from] = null;
    if (move.isEnPassant) board[move.to + (move.piece === 'P' ? 8 : -8)] = null;
    enPassantTarget = move.enPassantTarget;
    turn = turn === 'w' ? 'b' : 'w';
    selectedSquare = null;
    legalMovesForSelected = [];
    renderBoard();
    checkGameState();
}

function getPseudoLegalMoves(pos, piece, currentBoard, epTarget) {
    let moves = [];
    const row = Math.floor(pos / 8), col = pos % 8, isWhite = piece === piece.toUpperCase();
    const addMove = (r, c) => {
        if (r >= 0 && r < 8 && c >= 0 && c < 8) {
            const targetPos = r * 8 + c, targetPiece = currentBoard[targetPos];
            if (!targetPiece || (isWhite ? targetPiece === targetPiece.toLowerCase() : targetPiece === targetPiece.toUpperCase())) {
                moves.push({ from: pos, to: targetPos, piece, captured: targetPiece });
            }
        }
    };
    const p = piece.toLowerCase();
    if (p === 'p') {
        const dir = isWhite ? -1 : 1, startRow = isWhite ? 6 : 1;
        if (row + dir >= 0 && row + dir < 8 && !currentBoard[(row + dir) * 8 + col]) {
            moves.push({ from: pos, to: (row + dir) * 8 + col, piece });
            if (row === startRow && !currentBoard[(row + 2 * dir) * 8 + col]) moves.push({ from: pos, to: (row + 2 * dir) * 8 + col, piece });
        }
        for (const dc of [-1, 1]) {
            if (col + dc >= 0 && col + dc < 8) {
                const targetPos = (row + dir) * 8 + (col + dc);
                if (row + dir >= 0 && row + dir < 8) {
                    const targetPiece = currentBoard[targetPos];
                    if (targetPiece && (isWhite ? targetPiece === targetPiece.toLowerCase() : targetPiece === targetPiece.toUpperCase())) moves.push({ from: pos, to: targetPos, piece, captured: targetPiece });
                    if (targetPos === epTarget) moves.push({ from: pos, to: targetPos, piece, captured: isWhite ? 'p' : 'P', isEnPassant: true });
                }
            }
        }
    } else if (p === 'n') { [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => addMove(row + dr, col + dc)); }
    else if (p === 'b' || p === 'r' || p === 'q') {
        const dirs = [];
        if (p === 'b' || p === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
        if (p === 'r' || p === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
        for (let [dr, dc] of dirs) {
            let r = row + dr, c = col + dc;
            while (r >= 0 && r < 8 && c >= 0 && c < 8) {
                const targetPos = r * 8 + c, targetPiece = currentBoard[targetPos];
                if (!targetPiece) moves.push({ from: pos, to: targetPos, piece });
                else {
                    if (isWhite ? targetPiece === targetPiece.toLowerCase() : targetPiece === targetPiece.toUpperCase()) moves.push({ from: pos, to: targetPos, piece, captured: targetPiece });
                    break;
                }
                r += dr; c += dc;
            }
        }
    } else if (p === 'k') {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr !== 0 || dc !== 0) addMove(row + dr, col + dc);
    }
    return moves;
}

function getLegalMoves(pos, piece, currentBoard, epTarget) {
    return getPseudoLegalMoves(pos, piece, currentBoard, epTarget).filter(move => {
        const testBoard = [...currentBoard];
        testBoard[move.to] = piece;
        testBoard[move.from] = null;
        if (move.isEnPassant) testBoard[piece === piece.toUpperCase() ? move.to + 8 : move.to - 8] = null;
        return !isKingInCheck(piece === piece.toUpperCase() ? 'w' : 'b', testBoard);
    });
}

function isKingInCheck(color, currentBoard) {
    const kingPiece = color === 'w' ? 'K' : 'k', kingPos = currentBoard.indexOf(kingPiece);
    if (kingPos === -1) return false;
    const enemyColor = color === 'w' ? 'b' : 'w';
    for (let i = 0; i < 64; i++) {
        const piece = currentBoard[i];
        if (piece && (enemyColor === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase())) {
            if (getPseudoLegalMoves(i, piece, currentBoard, null).some(m => m.to === kingPos)) return true;
        }
    }
    return false;
}

function checkGameState() {
    let hasLegalMoves = false;
    for (let i = 0; i < 64; i++) {
        const piece = board[i];
        if (piece && (turn === 'w' ? piece === piece.toUpperCase() : piece === piece.toLowerCase())) {
            if (getLegalMoves(i, piece, board, enPassantTarget).length > 0) { hasLegalMoves = true; break; }
        }
    }
    const inCheck = isKingInCheck(turn, board);
    if (!hasLegalMoves) {
        isGameOver = true;
        showVictory(inCheck ? `Vencedor: ${turn === 'w' ? 'Pretas' : 'Brancas'}` : "Empate (Afogamento)");
    }
    updateUI();
}

function updateUI() {
    if (!isOnlineGame || myOnlineColor === turn) {
        turnText.innerText = isGameOver ? "Fim de Jogo" : `Vez das ${turn === 'w' ? 'Brancas' : 'Pretas'}`;
    } else {
        turnText.innerText = `Vez das ${turn === 'w' ? 'Brancas' : 'Pretas'} (Inimigo)`;
    }
    turnDot.classList.toggle('active', turn === 'w');
}

function renderBoard() {
    boardEl.innerHTML = '';
    const inCheck = !isGameOver && isKingInCheck(turn, board);
    const kingPos = board.indexOf(turn === 'w' ? 'K' : 'k');
    for (let i = 0; i < 64; i++) {
        const actualIndex = isFlipped ? (63 - i) : i, r = Math.floor(actualIndex / 8), c = actualIndex % 8;
        const square = document.createElement('div');
        square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
        square.dataset.index = actualIndex;
        
        if (selectedSquare === actualIndex) square.style.backgroundColor = 'rgba(0, 243, 255, 0.6)';
        if (algebraicHistory.length > 0) {
            const last = algebraicHistory[algebraicHistory.length-1];
            if (last && (last.from === actualIndex || last.to === actualIndex)) square.classList.add('last-move');
        }
        const move = legalMovesForSelected.find(m => m.to === actualIndex);
        if (move) square.classList.add(move.captured ? 'capture-highlight' : 'highlight');
        if (inCheck && actualIndex === kingPos) square.classList.add('in-check');
        
        const piece = board[actualIndex];
        if (piece) {
            square.innerText = getPieceChar(piece); 
            square.classList.add(piece === piece.toUpperCase() ? 'piece-w' : 'piece-b');
        }
        square.onclick = () => handleSquareClick(actualIndex);
        boardEl.appendChild(square);
    }
}

function handleSquareClick(idx) {
    if (isGameOver || (isOnlineGame && turn !== myOnlineColor) || (gameMode === 'pvc' && turn === 'b')) return;
    const clickedPiece = board[idx];
    if (selectedSquare !== null) {
        const move = legalMovesForSelected.find(m => m.to === idx);
        if (move) { executeMove(move); return; }
    }
    if (clickedPiece) {
        const isWhitePiece = clickedPiece === clickedPiece.toUpperCase();
        if ((turn === 'w' && isWhitePiece) || (turn === 'b' && !isWhitePiece)) {
            selectedSquare = idx;
            legalMovesForSelected = getLegalMoves(idx, clickedPiece, board, enPassantTarget);
        } else { selectedSquare = null; legalMovesForSelected = []; }
    } else { selectedSquare = null; legalMovesForSelected = []; }
    renderBoard();
}

function executeMove(move) {
    const isPawn = move.piece.toLowerCase() === 'p';
    const isPromotionRank = (move.piece === 'P' && Math.floor(move.to / 8) === 0) || (move.piece === 'p' && Math.floor(move.to / 8) === 7);
    if (isPawn && isPromotionRank) {
        pendingPromotion = move;
        document.getElementById('promo-modal').style.display = 'flex';
        return;
    }
    finalizeMove(move);
}

function selectPromotion(pieceType) {
    document.getElementById('promo-modal').style.display = 'none';
    if (pendingPromotion) {
        pendingPromotion.piece = pendingPromotion.piece === 'P' ? pieceType.toUpperCase() : pieceType.toLowerCase();
        finalizeMove(pendingPromotion);
        pendingPromotion = null;
    }
}

function finalizeMove(move) {
    history.push({ board: [...board], turn, enPassantTarget, moveNumber });
    board[move.to] = move.piece;
    board[move.from] = null;
    if