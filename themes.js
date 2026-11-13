// Sistema de Temas e Preferências
const THEMES = {
    pieces: {
        classic: { 'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙', 'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' },
        modern: { 'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟', 'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' },
        letters: { 'K': 'K', 'Q': 'Q', 'R': 'R', 'B': 'B', 'N': 'N', 'P': 'P', 'k': 'k', 'q': 'q', 'r': 'r', 'b': 'b', 'n': 'n', 'p': 'p' }
    },
    boards: {
        dark: { light: '#2a2a30', dark: '#101014' },
        classic: { light: '#f0d9b5', dark: '#b58863' },
        blue: { light: '#2b3b52', dark: '#131c2b' }
    }
};

function loadSettings() {
    const pieceStyle = localStorage.getItem('pieceStyle') || 'classic';
    const boardStyle = localStorage.getItem('boardStyle') || 'dark';
    
    document.getElementById('piece-style').value = pieceStyle;
    document.getElementById('board-style').value = boardStyle;
    
    applyTheme();
}

function applyTheme() {
    const pieceStyle = document.getElementById('piece-style').value;
    const boardStyle = document.getElementById('board-style').value;

    // Guardar escolhas
    localStorage.setItem('pieceStyle', pieceStyle);
    localStorage.setItem('boardStyle', boardStyle);

    // Aplicar cores ao tabuleiro via CSS variables
    const boardColors = THEMES.boards[boardStyle];
    document.documentElement.style.setProperty('--board-light', boardColors.light);
    document.documentElement.style.setProperty('--board-dark', boardColors.dark);

    // Atualizar as peças no ecrã
    if (typeof renderBoard === 'function') {
        renderBoard();
    }
}

function getPieceChar(piece) {
    const style = localStorage.getItem('pieceStyle') || 'classic';
    return THEMES.pieces[style][piece] || '';
}

function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}