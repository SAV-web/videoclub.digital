// =================================================================
//                      COMPONENTE INLINE EXPANSION (EFECTO LIBRO)
// =================================================================

const gridContainer = document.getElementById('grid-container');
let expandedElement = null;
let activeCard = null;

function createExpandedContent(cardElement) {
    const fragment = document.createDocumentFragment();
    const frontClone = cardElement.querySelector('.flip-card-front').cloneNode(true);
    frontClone.classList.add('expanded-front');
    const backClone = cardElement.querySelector('.flip-card-back').cloneNode(true);
    backClone.classList.add('expanded-back');
    backClone.style.transform = 'none';
    fragment.appendChild(frontClone);
    fragment.appendChild(backClone);
    return fragment;
}

export function closeInlineExpansion() {
    if (expandedElement) {
        expandedElement.classList.add('is-closing');
        expandedElement.addEventListener('animationend', () => {
            expandedElement.remove();
            expandedElement = null;
        }, { once: true });
    }
    if (activeCard) {
        activeCard.classList.remove('is-hidden');
        activeCard = null;
    }
}

export function toggleInlineExpansion(cardElement) {
    if (cardElement === activeCard) {
        closeInlineExpansion();
        return;
    }

    closeInlineExpansion();

    activeCard = cardElement;
    activeCard.classList.add('is-hidden');

    expandedElement = document.createElement('div');
    expandedElement.className = 'expanded-card-container';
    
    const content = createExpandedContent(cardElement);
    expandedElement.appendChild(content);

    const cardRect = cardElement.getBoundingClientRect();
    const gridRect = gridContainer.getBoundingClientRect();
    const isRightColumn = (cardRect.left + cardRect.width / 2) > (gridRect.left + gridRect.width / 2);

    cardElement.parentNode.insertBefore(expandedElement, cardElement.nextSibling);

    requestAnimationFrame(() => {
        if (isRightColumn) {
            expandedElement.classList.add('expand-from-right');
        } else {
            expandedElement.classList.add('expand-from-left');
        }
    });
}

export function initInlineExpansion() {
    window.addEventListener('click', (e) => {
        if (expandedElement && !e.target.closest('.movie-card') && !e.target.closest('.expanded-card-container')) {
            closeInlineExpansion();
        }
        if (e.target.closest('#quick-view-close-btn')) {
             closeInlineExpansion();
        }
    });
}