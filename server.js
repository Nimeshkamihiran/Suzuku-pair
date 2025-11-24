const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import routes
const pairCodeRouter = require('./paircode');

// Use routes
app.use('/api/pair', pairCodeRouter);

// Serve HTML frontend
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Suzuku Mini Bot - Pair Code System</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 40px;
            max-width: 600px;
            width: 100%;
        }
        
        h1 {
            color: #667eea;
            text-align: center;
            margin-bottom: 10px;
            font-size: 2rem;
        }
        
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
        }
        
        .form-group {
            margin-bottom: 25px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 600;
        }
        
        input[type="text"] {
            width: 100%;
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        input[type="text"]:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .btn {
            width: 100%;
            padding: 15px;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            margin-bottom: 10px;
        }
        
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        
        .btn-secondary {
            background: #f0f0f0;
            color: #333;
        }
        
        .btn-secondary:hover {
            background: #e0e0e0;
        }
        
        .btn-danger {
            background: #ff4757;
            color: white;
        }
        
        .btn-danger:hover {
            background: #ff3838;
        }
        
        .result {
            margin-top: 20px;
            padding: 20px;
            border-radius: 10px;
            display: none;
        }
        
        .result.success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
        }
        
        .result.error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
        }
        
        .pair-code {
            font-size: 2rem;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
            color: #667eea;
            letter-spacing: 5px;
        }
        
        .loading {
            text-align: center;
            color: #667eea;
            display: none;
        }
        
        .status-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            margin-top: 10px;
        }
        
        .status-badge.connected {
            background: #d4edda;
            color: #155724;
        }
        
        .status-badge.disconnected {
            background: #f8d7da;
            color: #721c24;
        }
        
        .instructions {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 15px;
            margin-top: 20px;
            border-radius: 5px;
        }
        
        .instructions h3 {
            color: #667eea;
            margin-bottom: 10px;
        }
        
        .instructions ol {
            margin-left: 20px;
        }
        
        .instructions li {
            margin-bottom: 8px;
            color: #555;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Suzuku Mini Bot</h1>
        <p class="subtitle">WhatsApp Bot Pair Code System</p>
        
        <div class="form-group">
            <label for="phoneNumber">📱 Phone Number (with country code)</label>
            <input type="text" id="phoneNumber" placeholder="94712345678" />
        </div>
        
        <button class="btn btn-primary" onclick="generateCode()">
            🔑 Generate Pair Code
        </button>
        
        <button class="btn btn-secondary" onclick="connectBot()">
            🔗 Connect Bot
        </button>
        
        <button class="btn btn-secondary" onclick="checkStatus()">
            📊 Check Status
        </button>
        
        <button class="btn btn-danger" onclick="deleteSession()">
            🗑️ Delete Session
        </button>
        
        <div class="loading" id="loading">
            ⏳ Processing...
        </div>
        
        <div class="result" id="result"></div>
        
        <div class="instructions">
            <h3>📖 How to Use:</h3>
            <ol>
                <li>Enter your phone number with country code (e.g., 94712345678)</li>
                <li>Click "Generate Pair Code" to get your 8-digit code</li>
                <li>Open WhatsApp > Settings > Linked Devices > Link a Device</li>
                <li>Enter the pair code shown below</li>
                <li>Click "Connect Bot" to activate your bot</li>
            </ol>
        </div>
    </div>
    
    <script>
        function showLoading(show) {
            document.getElementById('loading').style.display = show ? 'block' : 'none';
        }
        
        function showResult(message, isSuccess) {
            const resultDiv = document.getElementById('result');
            resultDiv.className = 'result ' + (isSuccess ? 'success' : 'error');
            resultDiv.innerHTML = message;
            resultDiv.style.display = 'block';
        }
        
        async function generateCode() {
            const phoneNumber = document.getElementById('phoneNumber').value;
            
            if (!phoneNumber) {
                showResult('❌ Please enter a phone number', false);
                return;
            }
            
            showLoading(true);
            
            try {
                const response = await fetch('/api/pair/generate-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: phoneNumber })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showResult(
                        '<h3>✅ Pair Code Generated!</h3>' +
                        '<div class="pair-code">' + data.pairCode + '</div>' +
                        '<p><strong>Instructions:</strong></p>' +
                        '<ol style="text-align: left; margin-left: 20px;">' +
                        '<li>Open WhatsApp on your phone</li>' +
                        '<li>Go to Settings > Linked Devices</li>' +
                        '<li>Tap "Link a Device"</li>' +
                        '<li>Enter the code: <strong>' + data.pairCode + '</strong></li>' +
                        '<li>After linking, click "Connect Bot" button above</li>' +
                        '</ol>',
                        true
                    );
                } else {
                    showResult('❌ Error: ' + data.error, false);
                }
            } catch (error) {
                showResult('❌ Network error: ' + error.message, false);
            } finally {
                showLoading(false);
            }
        }
        
        async function connectBot() {
            const phoneNumber = document.getElementById('phoneNumber').value;
            
            if (!phoneNumber) {
                showResult('❌ Please enter a phone number', false);
                return;
            }
            
            showLoading(true);
            
            try {
                const response = await fetch('/api/pair/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ number: phoneNumber })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showResult(
                        '<h3>✅ Bot Connected Successfully!</h3>' +
                        '<p>Your bot is now active and ready to use.</p>' +
                        '<div class="status-badge connected">🟢 CONNECTED</div>',
                        true
                    );
                } else {
                    showResult('❌ Error: ' + data.error, false);
                }
            } catch (error) {
                showResult('❌ Network error: ' + error.message, false);
            } finally {
                showLoading(false);
            }
        }
        
        async function checkStatus() {
            const phoneNumber = document.getElementById('phoneNumber').value;
            
            if (!phoneNumber) {
                showResult('❌ Please enter a phone number', false);
                return;
            }
            
            showLoading(true);
            
            try {
                const response = await fetch('/api/pair/status/' + phoneNumber);
                const data = await response.json();
                
                if (data.success) {
                    const badge = data.connected ? 
                        '<div class="status-badge connected">🟢 CONNECTED</div>' :
                        '<div class="status-badge disconnected">🔴 DISCONNECTED</div>';
                    
                    showResult(
                        '<h3>📊 Bot Status</h3>' +
                        '<p><strong>Number:</strong> ' + data.number + '</p>' +
                        badge +
                        '<p style="margin-top: 10px;">' + data.message + '</p>',
                        true
                    );
                } else {
                    showResult('❌ Error: ' + data.error, false);
                }
            } catch (error) {
                showResult('❌ Network error: ' + error.message, false);
            } finally {
                showLoading(false);
            }
        }
        
        async function deleteSession() {
            const phoneNumber = document.getElementById('phoneNumber').value;
            
            if (!phoneNumber) {
                showResult('❌ Please enter a phone number', false);
                return;
            }
            
            if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
                return;
            }
            
            showLoading(true);
            
            try {
                const response = await fetch('/api/pair/session/' + phoneNumber, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showResult(
                        '<h3>✅ Session Deleted</h3>' +
                        '<p>' + data.message + '</p>',
                        true
                    );
                } else {
                    showResult('❌ Error: ' + data.error, false);
                }
            } catch (error) {
                showResult('❌ Network error: ' + error.message, false);
            } finally {
                showLoading(false);
            }
        }
    </script>
</body>
</html>
    `);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'active', 
        message: 'Server is running' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║   🤖 SUZUKU MINI BOT SERVER           ║
║   ✅ Server started successfully      ║
║   🌐 Port: ${PORT}                    ║
║   📡 URL: http://localhost:${PORT}    ║
╚═══════════════════════════════════════╝
    `);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;