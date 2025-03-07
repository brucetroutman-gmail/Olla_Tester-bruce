const form = document.getElementById('testerForm');
const resultsDiv = document.getElementById('results');
const modelSelect = document.getElementById('model');
const conversationNameInput = document.getElementById('conversationName');
let conversation = { model: '', prompts: [] };

// Populate model dropdown
async function populateModels() {
    try {
        const response = await fetch('http://localhost:11434/api/tags');
        const data = await response.json();
        data.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.text = model.name;
            modelSelect.appendChild(option);
        });
    } catch (error) {
        resultsDiv.textContent = 'Error fetching models. Please try again.';
    }
}

// Update conversation name dynamically
function updateConversationName(model) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}-${hour}:${minute}`;

    const cleanModel = model.split(':')[0]; // Remove :latest or any tag

    fetch('http://localhost:3022/system-info')
        .then(res => res.json())
        .then(data => {
            let macModel = data.macModel || 'Mac-Unknown';
            // Abbreviate MacBookPro and Mac Mini
            if (macModel.toLowerCase().includes('macbookpro')) {
                macModel = 'MBP';
            } else if (macModel.toLowerCase().includes('macmini')) {
                macModel = 'MINI';
            }
            conversationNameInput.value = `${macModel}-${cleanModel}-${timestamp}`;
        })
        .catch(() => {
            conversationNameInput.value = `Mac-Unknown-${cleanModel}-${timestamp}`;
        });
}

// Run a single prompt
async function runPrompt(num) {
    const promptText = document.getElementById(`prompt${num}`).value.trim();
    if (!promptText) {
        resultsDiv.textContent = `Error: Prompt ${num} is empty.`;
        return;
    }
    const model = modelSelect.value;
    if (!model) {
        resultsDiv.textContent = 'Error: Please select a model.';
        return;
    }

    updateConversationName(model);

    try {
        const response = await fetch('http://localhost:3022/run-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: promptText })
        });
        const result = await response.json();
        if (response.ok) {
            const { response: resp, metrics } = result;
            resultsDiv.innerHTML = `<h3>Prompt ${num} Response:</h3><pre>${resp || 'No response'}</pre><h3>Metrics:</h3><pre>${metrics ? JSON.stringify(metrics, null, 2) : 'No metrics available'}</pre>`;
            conversation.model = model;
            conversation.prompts = [{ prompt: promptText, response: resp, metrics }];
        } else {
            resultsDiv.textContent = `Error: ${result.error}`;
        }
    } catch (error) {
        resultsDiv.textContent = `Error: ${error.message}`;
    }
}

// Save conversation
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!conversation.model || conversation.prompts.length === 0) {
        resultsDiv.textContent = 'Error: No conversation to save.';
        return;
    }

    conversation.name = conversationNameInput.value || conversationNameInput.placeholder;
    try {
        const response = await fetch('http://localhost:3022/save-conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(conversation)
        });
        const result = await response.json();
        if (response.ok) {
            resultsDiv.textContent = `Conversation saved as ${result.filename}`;
        } else {
            resultsDiv.textContent = `Error: ${result.error}`;
        }
    } catch (error) {
        resultsDiv.textContent = `Error: ${error.message}`;
    }
});

// Expose runPrompt globally
window.runPrompt = runPrompt;

// Load models on startup
populateModels();