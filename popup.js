// Helper to get localized string
function getMsg(messageName) {
  return chrome.i18n.getMessage(messageName);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Translate UI elements
  document.getElementById('app-name').textContent = getMsg('appName');
  document.getElementById('select-btn').textContent = getMsg('selectBtn');
  document.getElementById('local-rules-title').textContent = getMsg('localRulesTitle');
  document.getElementById('global-rules-title').textContent = getMsg('globalRulesTitle');
  document.getElementById('export-btn').textContent = getMsg('exportBtn');
  document.getElementById('import-btn-label').textContent = getMsg('importBtn');

  const selectBtn = document.getElementById('select-btn');
  const localRulesList = document.getElementById('local-rules-list');
  const globalRulesList = document.getElementById('global-rules-list');
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
  
  // Load and display current rules (local and global)
  function refreshRules() {
    chrome.storage.local.get([hostname, 'global_rules'], (result) => {
      const localRules = result[hostname] || [];
      const globalRules = result['global_rules'] || [];
      
      renderRulesList(localRulesList, localRules, 'local');
      renderRulesList(globalRulesList, globalRules, 'global');
    });
  }

  function renderRulesList(listElement, rules, scope) {
    if (rules.length === 0) {
      listElement.innerHTML = `<div class="empty-state">${getMsg('emptyState')}</div>`;
      return;
    }
    
    listElement.innerHTML = '';
    rules.forEach(rule => {
      const li = document.createElement('li');
      
      const ruleSpan = document.createElement('span');
      ruleSpan.className = 'rule-text';
      ruleSpan.textContent = rule;
      ruleSpan.title = rule;
      
      const buttonsContainer = document.createElement('div');
      buttonsContainer.style.display = 'flex';
      buttonsContainer.style.alignItems = 'center';
      
      // Convert button (Make Global or Make Local)
      const convertBtn = document.createElement('button');
      convertBtn.className = 'action-btn';
      
      if (scope === 'local') {
        convertBtn.textContent = getMsg('makeGlobalAction');
        convertBtn.onclick = () => {
          chrome.storage.local.get([hostname, 'global_rules'], (res) => {
            const local = (res[hostname] || []).filter(r => r !== rule);
            const global = res['global_rules'] || [];
            if (!global.includes(rule)) {
              global.push(rule);
            }
            chrome.storage.local.set({
              [hostname]: local,
              'global_rules': global
            }, () => {
              refreshRules();
            });
          });
        };
      } else {
        convertBtn.textContent = getMsg('makeLocalAction');
        convertBtn.onclick = () => {
          chrome.storage.local.get([hostname, 'global_rules'], (res) => {
            const global = (res['global_rules'] || []).filter(r => r !== rule);
            const local = res[hostname] || [];
            if (!local.includes(rule)) {
              local.push(rule);
            }
            chrome.storage.local.set({
              [hostname]: local,
              'global_rules': global
            }, () => {
              refreshRules();
            });
          });
        };
      }
      
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '&times;';
      
      deleteBtn.onclick = () => {
        if (scope === 'local') {
          chrome.storage.local.get([hostname], (res) => {
            const local = (res[hostname] || []).filter(r => r !== rule);
            chrome.storage.local.set({ [hostname]: local }, () => {
              refreshRules();
            });
          });
        } else {
          chrome.storage.local.get(['global_rules'], (res) => {
            const global = (res['global_rules'] || []).filter(r => r !== rule);
            chrome.storage.local.set({ 'global_rules': global }, () => {
              refreshRules();
            });
          });
        }
      };
      
      buttonsContainer.appendChild(convertBtn);
      buttonsContainer.appendChild(deleteBtn);
      
      li.appendChild(ruleSpan);
      li.appendChild(buttonsContainer);
      listElement.appendChild(li);
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
