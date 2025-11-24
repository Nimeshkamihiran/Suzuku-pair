const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const router = express.Router();
const pino = require('pino');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason
} = require('neno-baileys');

// MongoDB Configuration
const mongoUri = 'mongodb://mongo:BGORvIJvaeLwqZCydaeTwQYQHPcywnuD@gondola.proxy.rlwy.net:41687';
const client = new MongoClient(mongoUri);
let db;

async function initMongo() {
    if (!db) {
        await client.connect();
        db = client.db('SUZUKU');
        await db.collection('sessions').createIndex({ number: 1 });
    }
    return db;
}

// Session Storage
const SESSION_BASE_PATH = './sessions';
const activeSockets = new Map();
const pairCodeRequests = new Map(); // Store pending pair code requests

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// ============================================
// STEP 1: Generate Pair Code (No CMD Required)
// ============================================
router.post('/generate-code', async (req, res) => {
    const { number } = req.body;
    
    if (!number) {
        return res.status(400).json({ 
            success: false, 
            error: 'Number is required' 
        });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    
    // Check if already generating
    if (pairCodeRequests.has(sanitizedNumber)) {
        return res.status(409).json({ 
            success: false, 
            error: 'Code generation already in progress for this number' 
        });
    }

    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    await fs.ensureDir(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: 'silent' });

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });

        // Store socket temporarily
        pairCodeRequests.set(sanitizedNumber, { socket, sessionPath });

        let pairCode = null;
        let isConnected = false;

        // Save credentials when updated
        socket.ev.on('creds.update', async () => {
            await saveCreds();
            
            // Save to MongoDB
            const fileContent = await fs.readFile(
                path.join(sessionPath, 'creds.json'), 
                'utf8'
            );
            
            const db = await initMongo();
            const collection = db.collection('sessions');
            const sessionId = uuidv4();
            
            await collection.updateOne(
                { number: sanitizedNumber },
                {
                    $set: {
                        sessionId,
                        number: sanitizedNumber,
                        creds: fileContent,
                        active: true,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                },
                { upsert: true }
            );
            
            console.log(`✅ Session saved to DB for ${sanitizedNumber}`);
        });

        // Handle connection updates
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                isConnected = true;
                console.log(`✅ Successfully connected: ${sanitizedNumber}`);
                
                // Clean up temporary socket
                pairCodeRequests.delete(sanitizedNumber);
                
                // Store in active sockets
                activeSockets.set(sanitizedNumber, socket);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(`❌ Logged out: ${sanitizedNumber}`);
                    await fs.remove(sessionPath);
                    pairCodeRequests.delete(sanitizedNumber);
                }
            }
        });

        // Request pairing code
        if (!socket.authState.creds.registered) {
            await delay(2000);
            pairCode = await socket.requestPairingCode(sanitizedNumber);
            
            res.status(200).json({
                success: true,
                number: sanitizedNumber,
                pairCode: pairCode,
                message: 'Enter this code in WhatsApp: Settings > Linked Devices > Link a Device'
            });
        } else {
            res.status(200).json({
                success: true,
                number: sanitizedNumber,
                message: 'Session already exists and is being restored'
            });
        }

    } catch (error) {
        console.error('Pair code generation error:', error);
        pairCodeRequests.delete(sanitizedNumber);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate pair code'
        });
    }
});

// ============================================
// STEP 2: Connect Bot Using Saved Session
// ============================================
router.post('/connect', async (req, res) => {
    const { number } = req.body;
    
    if (!number) {
        return res.status(400).json({ 
            success: false, 
            error: 'Number is required' 
        });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    
    // Check if already connected
    if (activeSockets.has(sanitizedNumber)) {
        return res.status(409).json({ 
            success: false, 
            error: 'Bot is already connected for this number' 
        });
    }

    try {
        // Restore session from MongoDB
        const db = await initMongo();
        const collection = db.collection('sessions');
        const doc = await collection.findOne({ 
            number: sanitizedNumber, 
            active: true 
        });

        if (!doc) {
            return res.status(404).json({ 
                success: false, 
                error: 'No saved session found. Please generate a pair code first.' 
            });
        }

        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        await fs.ensureDir(sessionPath);
        
        // Write saved creds to file
        await fs.writeFile(
            path.join(sessionPath, 'creds.json'), 
            doc.creds
        );

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: 'silent' });

        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });

        // Save credentials on update
        socket.ev.on('creds.update', async () => {
            await saveCreds();
            
            const fileContent = await fs.readFile(
                path.join(sessionPath, 'creds.json'), 
                'utf8'
            );
            
            await collection.updateOne(
                { number: sanitizedNumber },
                {
                    $set: {
                        creds: fileContent,
                        updatedAt: new Date()
                    }
                }
            );
        });

        // Handle connection updates
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                activeSockets.set(sanitizedNumber, socket);
                console.log(`✅ Bot connected: ${sanitizedNumber}`);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(`❌ Logged out: ${sanitizedNumber}`);
                    activeSockets.delete(sanitizedNumber);
                    
                    await collection.updateOne(
                        { number: sanitizedNumber },
                        { $set: { active: false } }
                    );
                }
            }
        });

        res.status(200).json({
            success: true,
            number: sanitizedNumber,
            message: 'Bot connection initiated successfully'
        });

    } catch (error) {
        console.error('Connection error:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to connect bot'
        });
    }
});

// ============================================
// STEP 3: Check Connection Status
// ============================================
router.get('/status/:number', (req, res) => {
    const sanitizedNumber = req.params.number.replace(/[^0-9]/g, '');
    
    if (activeSockets.has(sanitizedNumber)) {
        res.status(200).json({
            success: true,
            connected: true,
            number: sanitizedNumber,
            message: 'Bot is connected and active'
        });
    } else {
        res.status(200).json({
            success: true,
            connected: false,
            number: sanitizedNumber,
            message: 'Bot is not connected'
        });
    }
});

// ============================================
// STEP 4: Disconnect Bot
// ============================================
router.post('/disconnect', async (req, res) => {
    const { number } = req.body;
    
    if (!number) {
        return res.status(400).json({ 
            success: false, 
            error: 'Number is required' 
        });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    
    if (!socket) {
        return res.status(404).json({ 
            success: false, 
            error: 'No active connection found for this number' 
        });
    }

    try {
        socket.ws.close();
        activeSockets.delete(sanitizedNumber);
        
        res.status(200).json({
            success: true,
            number: sanitizedNumber,
            message: 'Bot disconnected successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to disconnect bot'
        });
    }
});

// ============================================
// STEP 5: Delete Session
// ============================================
router.delete('/session/:number', async (req, res) => {
    const sanitizedNumber = req.params.number.replace(/[^0-9]/g, '');
    
    try {
        // Disconnect if active
        const socket = activeSockets.get(sanitizedNumber);
        if (socket) {
            socket.ws.close();
            activeSockets.delete(sanitizedNumber);
        }
        
        // Delete from database
        const db = await initMongo();
        const collection = db.collection('sessions');
        await collection.deleteOne({ number: sanitizedNumber });
        
        // Delete session files
        const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
        if (fs.existsSync(sessionPath)) {
            await fs.remove(sessionPath);
        }
        
        res.status(200).json({
            success: true,
            number: sanitizedNumber,
            message: 'Session deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to delete session'
        });
    }
});

// ============================================
// STEP 6: List All Sessions
// ============================================
router.get('/sessions', async (req, res) => {
    try {
        const db = await initMongo();
        const collection = db.collection('sessions');
        const sessions = await collection.find({ active: true }).toArray();
        
        const sessionList = sessions.map(doc => ({
            number: doc.number,
            sessionId: doc.sessionId,
            connected: activeSockets.has(doc.number),
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
        }));
        
        res.status(200).json({
            success: true,
            count: sessionList.length,
            sessions: sessionList
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch sessions'
        });
    }
});

// ============================================
// Auto-reconnect on server restart
// ============================================
(async () => {
    try {
        await initMongo();
        const collection = db.collection('sessions');
        const sessions = await collection.find({ active: true }).toArray();
        
        for (const doc of sessions) {
            const number = doc.number;
            
            if (!activeSockets.has(number)) {
                console.log(`🔄 Auto-reconnecting: ${number}`);
                
                // Simulate POST request
                const mockReq = { body: { number } };
                const mockRes = {
                    status: (code) => ({
                        json: (data) => {
                            console.log(`${data.success ? '✅' : '❌'} ${number}: ${data.message}`);
                        }
                    })
                };
                
                // Call connect route
                await router.stack
                    .find(r => r.route?.path === '/connect')
                    .route.stack[0].handle(mockReq, mockRes);
            }
        }
        
        console.log('✅ Auto-reconnect completed');
    } catch (error) {
        console.error('❌ Auto-reconnect failed:', error);
    }
})();

module.exports = router;