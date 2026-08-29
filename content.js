// Retrieve rules and apply them as early as possible
const hostname = window.location.hostname;
let blockedSelectors = [];
let styleElement = null;

// Apply styles to hide elements
function updateStylesheet() {
  if (!styleElement) {
    styleElement = document.createElement('style');
    // Use document.documentElement because document.head might not be parsed yet at document_start
    (document.head || document.documentElement).appendChild(styleElement);
  }
  if (blockedSelectors.length > 0) {
    const css = blockedSelectors.map(sel => `${sel} { display: none !important; }`).join('\n');
    styleElement.textContent = css;
  } else {
    styleElement.textContent = '';
  }
}

// Load existing rules from storage
chrome.storage.local.get([hostname], (result) => {
  if (result[hostname]) {
    blockedSelectors = result[hostname];
    updateStylesheet();
  }
});

// Watch for DOM changes to inject style if head/documentElement becomes available
const observer = new MutationObserver(() => {
  if ((document.head || document.documentElement) && !styleElement) {
    updateStylesheet();
    observer.disconnect();
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// --- Selection Mode Logic ---
let isSelecting = false;
let hoveredElement = null;
let originalOutline = '';
let originalCursor = '';
let iframeStyle = null;

function preventDefaultAction(e) {
  if (isSelecting) {
    e.preventDefault();
    e.stopPropagation();
  }
}


function onMouseOver(e) {
  if (!isSelecting) return;
  
  // Clean up previous element highlight
  if (hoveredElement && hoveredElement !== e.target) {
    hoveredElement.style.outline = originalOutline;
    hoveredElement.style.cursor = originalCursor;
  }
  
  hoveredElement = e.target;
  originalOutline = hoveredElement.style.outline;
  originalCursor = hoveredElement.style.cursor;
  
  // Highlight current element
  hoveredElement.style.outline = '2px dashed red';
  hoveredElement.style.cursor = 'crosshair';
}

function onMouseOut(e) {
  if (!isSelecting || !hoveredElement) return;
  if (e.target === hoveredElement) {
    hoveredElement.style.outline = originalOutline;
    hoveredElement.style.cursor = originalCursor;
    hoveredElement = null;
  }
}

function onClick(e) {
  if (!isSelecting) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const element = e.target;
  const selector = generateUniqueSelector(element);
  
  if (selector) {
    // Add to list and save
    if (!blockedSelectors.includes(selector)) {
      blockedSelectors.push(selector);
      chrome.storage.local.set({ [hostname]: blockedSelectors }, () => {
        updateStylesheet();
        // Notify popup/background that selection is complete
        chrome.runtime.sendMessage({ action: 'selectionComplete', selector: selector });
      });
    }
  }
  
  // Clean highlight of the selected element
  if (hoveredElement) {
    hoveredElement.style.outline = originalOutline;
    hoveredElement.style.cursor = originalCursor;
    hoveredElement = null;
  }
  
  // Selection mode remains active for continuous clicking
}

function generateUniqueSelector(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';
  
  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let selector = el.nodeName.toLowerCase();
    
    // Check if element has a unique ID to stop climbing
    if (el.id && !/^[0-9]/.test(el.id) && el.id.length < 50) {
      try {
        if (document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
          path.unshift('#' + CSS.escape(el.id));
          break;
        }
      } catch (e) {}
    }
    
    if (selector === 'html' || selector === 'body') {
      path.unshift(selector);
      break;
    }
    
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.trim().split(/\s+/).filter(c => c && !c.includes(':') && !/^[0-9]/.test(c));
      if (classes.length > 0) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }
    }
    
    // Correct forward count for nth-of-type
    let sibling = el.parentNode ? el.parentNode.firstElementChild : null;
    let sameTagCount = 0;
    let sibIndex = 0;
    while (sibling) {
      if (sibling.nodeName === el.nodeName) {
        sameTagCount++;
        if (sibling === el) {
          sibIndex = sameTagCount;
        }
      }
      sibling = sibling.nextElementSibling;
    }
    
    if (sameTagCount > 1) {
      selector += `:nth-of-type(${sibIndex})`;
    }
    
    path.unshift(selector);
    el = el.parentNode;
  }
  
  return path.join(' > ');
}

function onKeyDown(e) {
  if (e.key === 'Escape' && isSelecting) {
    e.preventDefault();
    e.stopPropagation();
    disableSelectionMode();
  }
}

function enableSelectionMode() {
  isSelecting = true;
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('mousedown', preventDefaultAction, true);
  document.addEventListener('mouseup', preventDefaultAction, true);
  document.addEventListener('keydown', onKeyDown, true);
  
  // Inject CSS to disable pointer events on iframes so they can be selected as elements
  iframeStyle = document.createElement('style');
  iframeStyle.textContent = 'iframe { pointer-events: none !important; }';
  (document.head || document.documentElement).appendChild(iframeStyle);
}

function disableSelectionMode() {
  isSelecting = false;
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('mouseout', onMouseOut, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('mousedown', preventDefaultAction, true);
  document.removeEventListener('mouseup', preventDefaultAction, true);
  document.removeEventListener('keydown', onKeyDown, true);
  
  if (iframeStyle) {
    iframeStyle.remove();
    iframeStyle = null;
  }
  
  // Notify runtime that selection mode has stopped
  chrome.runtime.sendMessage({ action: 'selectionDisabled' });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startSelection') {
    enableSelectionMode();
    sendResponse({ status: 'started' });
  } else if (request.action === 'stopSelection') {
    disableSelectionMode();
    sendResponse({ status: 'stopped' });
  } else if (request.action === 'getSelectionState') {
    sendResponse({ isSelecting: isSelecting });
  } else if (request.action === 'getBlockedRules') {
    sendResponse({ rules: blockedSelectors });
  } else if (request.action === 'removeRule') {
    blockedSelectors = blockedSelectors.filter(r => r !== request.rule);
    chrome.storage.local.set({ [hostname]: blockedSelectors }, () => {
      updateStylesheet();
      sendResponse({ status: 'removed', rules: blockedSelectors });
    });
    return true; // Keep response channel open for async storage write
  }
});
