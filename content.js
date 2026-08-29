// Retrieve rules and apply them as early as possible
const hostname = window.location.hostname;
let blockedSelectors = [];
let globalSelectors = [];
let styleElement = null;

// Apply styles to hide elements
function updateStylesheet() {
  if (!styleElement) {
    styleElement = document.createElement('style');
    // Use document.documentElement because document.head might not be parsed yet at document_start
    (document.head || document.documentElement).appendChild(styleElement);
  }
  const combined = [...blockedSelectors, ...globalSelectors];
  if (combined.length > 0) {
    const css = combined.map(sel => `${sel} { display: none !important; }`).join('\n');
    styleElement.textContent = css;
  } else {
    styleElement.textContent = '';
  }
}

// Load existing rules from storage
chrome.storage.local.get([hostname, 'global_rules'], (result) => {
  blockedSelectors = result[hostname] || [];
  globalSelectors = result['global_rules'] || [];
  updateStylesheet();
});

// Watch for storage changes to dynamically apply/restore styles instantly
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    let needsUpdate = false;
    if (changes[hostname]) {
      blockedSelectors = changes[hostname].newValue || [];
      needsUpdate = true;
    }
    if (changes['global_rules']) {
      globalSelectors = changes['global_rules'].newValue || [];
      needsUpdate = true;
    }
    if (needsUpdate) {
      updateStylesheet();
    }
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
let sessionBlockedSelectors = [];
let indicatorElement = null;
let selectedScope = 'local';

function preventDefaultAction(e) {
  if (isSelecting) {
    if (e.target.closest('#clickblock-indicator')) return;
    e.preventDefault();
    e.stopPropagation();
  }
}


function onMouseOver(e) {
  if (!isSelecting) return;
  if (e.target.closest('#clickblock-indicator')) return;
  
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
  if (e.target.closest('#clickblock-indicator')) return;
  if (e.target === hoveredElement) {
    hoveredElement.style.outline = originalOutline;
    hoveredElement.style.cursor = originalCursor;
    hoveredElement = null;
  }
}

function onClick(e) {
  if (!isSelecting) return;
  if (e.target.closest('#clickblock-indicator')) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const element = e.target;
  const selector = generateUniqueSelector(element);
  
  if (selector) {
    if (selectedScope === 'local') {
      if (!blockedSelectors.includes(selector)) {
        blockedSelectors.push(selector);
        sessionBlockedSelectors.push({ scope: 'local', selector: selector });
        updateUndoButtonState();
        chrome.storage.local.set({ [hostname]: blockedSelectors }, () => {
          updateStylesheet();
          chrome.runtime.sendMessage({ action: 'selectionComplete', selector: selector });
        });
      }
    } else {
      if (!globalSelectors.includes(selector)) {
        globalSelectors.push(selector);
        sessionBlockedSelectors.push({ scope: 'global', selector: selector });
        updateUndoButtonState();
        chrome.storage.local.get(['global_rules'], (res) => {
          const rules = res.global_rules || [];
          if (!rules.includes(selector)) {
            rules.push(selector);
          }
          chrome.storage.local.set({ global_rules: rules }, () => {
            updateStylesheet();
            chrome.runtime.sendMessage({ action: 'selectionComplete', selector: selector });
          });
        });
      }
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

function createIndicator() {
  if (indicatorElement) return;
  
  indicatorElement = document.createElement('div');
  indicatorElement.id = 'clickblock-indicator';
  
  indicatorElement.style.cssText = `
    position: fixed !important;
    top: 16px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background-color: #202124 !important;
    color: white !important;
    padding: 8px 16px !important;
    border-radius: 30px !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3) !important;
    z-index: 2147483647 !important;
    pointer-events: auto !important;
    letter-spacing: 0.5px !important;
    user-select: none !important;
  `;
  
  const textSpan = document.createElement('span');
  textSpan.textContent = 'Selection Mode Active (Press ESC to exit)';
  textSpan.style.cssText = 'color: white !important; font-size: 13px !important; font-family: inherit !important;';
  
  // Scope selection toggle container
  const scopeContainer = document.createElement('div');
  scopeContainer.style.cssText = 'display:flex; align-items:center; gap:4px; background-color:#3c4043; border-radius:14px; padding:2px; margin-right:4px;';
  
  const localOption = document.createElement('button');
  localOption.textContent = 'This Site';
  localOption.style.cssText = 'background-color:#1a73e8; color:white; border:none; padding:4px 8px; border-radius:12px; cursor:pointer; font-size:11px; font-weight:bold; transition:background-color 0.15s; outline:none;';
  
  const globalOption = document.createElement('button');
  globalOption.textContent = 'Global';
  globalOption.style.cssText = 'background-color:transparent; color:#e8eaed; border:none; padding:4px 8px; border-radius:12px; cursor:pointer; font-size:11px; font-weight:bold; transition:background-color 0.15s; outline:none;';
  
  localOption.onclick = (e) => {
    e.preventDefault();
    selectedScope = 'local';
    localOption.style.backgroundColor = '#1a73e8';
    localOption.style.color = 'white';
    globalOption.style.backgroundColor = 'transparent';
    globalOption.style.color = '#e8eaed';
  };
  
  globalOption.onclick = (e) => {
    e.preventDefault();
    selectedScope = 'global';
    globalOption.style.backgroundColor = '#1a73e8';
    globalOption.style.color = 'white';
    localOption.style.backgroundColor = 'transparent';
    localOption.style.color = '#e8eaed';
  };
  
  scopeContainer.appendChild(localOption);
  scopeContainer.appendChild(globalOption);

  const undoBtn = document.createElement('button');
  undoBtn.id = 'clickblock-undo-btn';
  undoBtn.textContent = 'Undo';
  undoBtn.style.cssText = `
    background-color: #3c4043 !important;
    color: #e8eaed !important;
    border: 1px solid #5f6368 !important;
    padding: 5px 12px !important;
    border-radius: 16px !important;
    cursor: pointer !important;
    font-size: 11px !important;
    font-weight: bold !important;
    transition: background-color 0.15s !important;
    outline: none !important;
  `;
  undoBtn.disabled = true;
  undoBtn.style.opacity = '0.5';
  undoBtn.style.cursor = 'not-allowed';
  
  undoBtn.addEventListener('mouseenter', () => {
    if (!undoBtn.disabled) undoBtn.style.backgroundColor = '#5f6368';
  });
  undoBtn.addEventListener('mouseleave', () => {
    if (!undoBtn.disabled) undoBtn.style.backgroundColor = '#3c4043';
  });
  undoBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    undoLastBlocked();
  };
  
  const exitBtn = document.createElement('button');
  exitBtn.textContent = 'Exit';
  exitBtn.style.cssText = `
    background-color: #ea4335 !important;
    color: white !important;
    border: none !important;
    padding: 5px 12px !important;
    border-radius: 16px !important;
    cursor: pointer !important;
    font-size: 11px !important;
    font-weight: bold !important;
    transition: background-color 0.15s !important;
    outline: none !important;
  `;
  exitBtn.addEventListener('mouseenter', () => {
    exitBtn.style.backgroundColor = '#d93025';
  });
  exitBtn.addEventListener('mouseleave', () => {
    exitBtn.style.backgroundColor = '#ea4335';
  });
  exitBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    disableSelectionMode();
  };
  
  indicatorElement.appendChild(textSpan);
  indicatorElement.appendChild(scopeContainer);
  indicatorElement.appendChild(undoBtn);
  indicatorElement.appendChild(exitBtn);
  
  document.body.appendChild(indicatorElement);
}

function removeIndicator() {
  if (indicatorElement) {
    indicatorElement.remove();
    indicatorElement = null;
  }
}

function updateUndoButtonState() {
  const undoBtn = document.getElementById('clickblock-undo-btn');
  if (undoBtn) {
    const hasHistory = sessionBlockedSelectors.length > 0;
    undoBtn.disabled = !hasHistory;
    if (hasHistory) {
      undoBtn.style.opacity = '1.0';
      undoBtn.style.cursor = 'pointer';
      undoBtn.style.backgroundColor = '#3c4043';
    } else {
      undoBtn.style.opacity = '0.5';
      undoBtn.style.cursor = 'not-allowed';
    }
  }
}

function undoLastBlocked() {
  if (sessionBlockedSelectors.length === 0) return;
  const lastItem = sessionBlockedSelectors.pop();
  
  if (lastItem.scope === 'local') {
    blockedSelectors = blockedSelectors.filter(s => s !== lastItem.selector);
    chrome.storage.local.set({ [hostname]: blockedSelectors }, () => {
      updateUndoButtonState();
      chrome.runtime.sendMessage({ action: 'selectionComplete' });
    });
  } else {
    globalSelectors = globalSelectors.filter(s => s !== lastItem.selector);
    chrome.storage.local.get(['global_rules'], (res) => {
      const rules = (res.global_rules || []).filter(s => s !== lastItem.selector);
      chrome.storage.local.set({ global_rules: rules }, () => {
        updateUndoButtonState();
        chrome.runtime.sendMessage({ action: 'selectionComplete' });
      });
    });
  }
}

function enableSelectionMode() {
  isSelecting = true;
  sessionBlockedSelectors = [];
  selectedScope = 'local'; // Reset default scope to local on each activation
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
  
  createIndicator();
}

function disableSelectionMode() {
  isSelecting = false;
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('mouseout', onMouseOut, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('mousedown', preventDefaultAction, true);
  document.removeEventListener('mouseup', preventDefaultAction, true);
  document.removeEventListener('keydown', onKeyDown, true);
  
  // Reset style of the currently hovered element if selection mode is stopped
  if (hoveredElement) {
    hoveredElement.style.outline = originalOutline;
    hoveredElement.style.cursor = originalCursor;
    hoveredElement = null;
  }
  
  if (iframeStyle) {
    iframeStyle.remove();
    iframeStyle = null;
  }
  
  removeIndicator();
  
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
