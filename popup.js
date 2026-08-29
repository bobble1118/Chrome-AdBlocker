// Helper to get localized string
function getMsg(messageName) {
  return chrome.i18n.getMessage(messageName);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Translate UI elements
  document.getElementById('app-name').textContent = getMsg('appName');
  document.getElementById('select-btn').textContent = getMsg('selectBtn');
  document.getElementById('blocked-title').textContent = getMsg('blockedTitle');
  document.getElementById('export-btn').textContent = getMsg('exportBtn');
  document.getElementById('import-btn-label').textContent = getMsg('importBtn');

  const selectBtn = document.getElementById('select-btn');
  const rulesList = document.getElementById('rules-list');
  const domainInfo = document.getElementById('domain-info');
  const exportBtn = document.getElementById('export-btn');
  const importBtnLabel = document.getElementById('import-btn-label');
  const importFileInput = document.getElementById('import-file-input');
  
  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    domainInfo.textContent = getMsg('cannotRun');
    selectBtn.disabled = true;
    return;
  }
  
  let url;
  try {
    url = new URL(tab.url);
  } catch (e) {
    domainInfo.textContent = getMsg('invalidUrl');
    selectBtn.disabled = true;
    return;
  }
  
  // Only allow on http/https pages
  if (!url.protocol.startsWith('http')) {
    domainInfo.textContent = getMsg('systemPage');
    selectBtn.disabled = true;
    return;
  }
  
  const hostname = url.hostname;
  domainInfo.textContent = hostname;
  
  // Load and display current rules
  function refreshRules() {
    chrome.tabs.sendMessage(tab.id, { action: 'getBlockedRules' }, (response) => {
      // If extension is newly installed or page not refreshed, content script might not respond
      if (chrome.runtime.lastError || !response) {
        rulesList.innerHTML = `<div class="empty-state">${getMsg('refreshWarning')}</div>`;
        return;
      }
      
      const rules = response.rules || [];
      if (rules.length === 0) {
        rulesList.innerHTML = `<div class="empty-state">${getMsg('emptyState')}</div>`;
        return;
      }
      
      rulesList.innerHTML = '';
      rules.forEach(rule => {
        const li = document.createElement('li');
        
        const ruleSpan = document.createElement('span');
        ruleSpan.className = 'rule-text';
        ruleSpan.textContent = rule;
        ruleSpan.title = rule;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = () => {
          chrome.tabs.sendMessage(tab.id, { action: 'removeRule', rule: rule }, (res) => {
            refreshRules();
          });
        };
        
        li.appendChild(ruleSpan);
        li.appendChild(deleteBtn);
        rulesList.appendChild(li);
      });
    });
  }
  
  refreshRules();
  
  let isSelectingMode = false;

  function updateSelectButtonState(isSelecting) {
    isSelectingMode = isSelecting;
    if (isSelecting) {
      selectBtn.textContent = getMsg('stopSelectBtn');
      selectBtn.style.backgroundColor = '#d93025';
      selectBtn.onclick = () => {
        chrome.tabs.sendMessage(tab.id, { action: 'stopSelection' }, (response) => {
          updateSelectButtonState(false);
          refreshRules();
        });
      };
    } else {
      selectBtn.textContent = getMsg('selectBtn');
      selectBtn.style.backgroundColor = '#1a73e8';
      selectBtn.onclick = () => {
        chrome.tabs.sendMessage(tab.id, { action: 'startSelection' }, (response) => {
          if (chrome.runtime.lastError || !response) {
            alert(getMsg('refreshWarning'));
            return;
          }
          window.close();
        });
      };
    }
  }

  // Get initial selection state
  chrome.tabs.sendMessage(tab.id, { action: 'getSelectionState' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      updateSelectButtonState(false);
      return;
    }
    updateSelectButtonState(!!response.isSelecting);
  });

  // Export Rules (all rules in chrome.storage.local)
  exportBtn.onclick = () => {
    chrome.storage.local.get(null, (allRules) => {
      const blob = new Blob([JSON.stringify(allRules, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clickblock-rules-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // Import Rules (trigger file input click)
  importBtnLabel.onclick = () => {
    importFileInput.click();
  };

  importFileInput.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        
        // Simple validation check: expected format is { [hostname]: string[] }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('Invalid format');
        }

        for (const key in parsed) {
          if (!Array.isArray(parsed[key])) {
            throw new Error('Invalid rules format under domain key');
          }
        }

        // Save imported rules to chrome.storage.local (this will merge/overwrite keys)
        chrome.storage.local.set(parsed, () => {
          alert(getMsg('importSuccess'));
          // Reload rules for current page
          refreshRules();
          // Reload tab stylesheet if matching
          chrome.tabs.reload(tab.id);
        });
      } catch (err) {
        alert(getMsg('importError'));
      }
    };
    reader.readAsText(file);
    // Reset file input value so same file can be selected again if needed
    importFileInput.value = '';
  };
  
  // Listen for selection completion
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'selectionComplete') {
      refreshRules();
    } else if (request.action === 'selectionDisabled') {
      updateSelectButtonState(false);
      refreshRules();
    }
  });
});
