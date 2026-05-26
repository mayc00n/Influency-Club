import express from "express";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";
import fs from "fs";
import multer from "multer";
import { google } from "googleapis";
import { initializeApp as initClientApp } from 'firebase/app';
import { initializeFirestore, doc, collection, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

dotenv.config();

let db: any;
let currentDatabaseId = "(default)";

const appletId = "dab4eee5-aa37-4dea-a5b7-8027984a44d9";
const aiStudioDbId = `ai-studio-${appletId}`;

const FieldValue = {
  serverTimestamp() {
    return serverTimestamp();
  }
};

// Initialize Database
async function initializeDb() {
  try {
    const databaseId = firebaseConfig.firestoreDatabaseId || aiStudioDbId || "(default)";
    console.log(`Starting Firestore Web Client initialization under Database: [${databaseId}]`);

    const clientApp = initClientApp(firebaseConfig);
    const firestoreInstance = initializeFirestore(clientApp, {
      ignoreUndefinedProperties: true
    }, databaseId);

    // Compatibility wrapper to avoid rewriting any of the route controllers
    db = {
      collection(colName: string) {
        return {
          doc(docId: string) {
            return {
              async get() {
                const docRef = doc(firestoreInstance, colName, docId);
                const snap = await getDoc(docRef);
                return {
                  exists: snap.exists(),
                  data() {
                    return snap.data();
                  }
                };
              },
              async set(data: any) {
                const docRef = doc(firestoreInstance, colName, docId);
                return await setDoc(docRef, data);
              }
            };
          }
        };
      }
    };

    // Verification check using settings collection instead of reserved __system__
    const testRef = doc(firestoreInstance, 'settings', 'server_health');
    await setDoc(testRef, {
      lastCheck: serverTimestamp(),
      serverId: process.pid,
      databaseId: databaseId
    });
    
    currentDatabaseId = databaseId;
    console.log(`>>> SUCCESS: Firestore Web Client successfully bound under [${databaseId}]!`);
    return true;
  } catch (error: any) {
    console.error("Critical error during Firestore Client initialization:", error);
    return false;
  }
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

app.use(express.json());

// Middleware to ensure DB is ready
app.use(async (req, res, next) => {
  if (!db) {
    console.log("Request arrived but DB not ready. Attempting secondary initialization...");
    await initializeDb();
  }
  if (!db && req.path.startsWith('/api')) {
    return res.status(503).json({ 
      error: "Banco de dados não disponível. Por favor, aguarde o provisionamento ou verifique as configurações no console do Firebase.",
      code: 'DB_NOT_READY'
    });
  }
  next();
});

const uploadDir = path.join(process.cwd(), '.tmp', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
const localUploadsDir = path.join(process.cwd(), '.tmp', 'public_uploads');
fs.mkdirSync(localUploadsDir, { recursive: true });
app.use('/uploads', express.static(localUploadsDir));

// Google OAuth setup for Owner
const getOAuth2Client = (req?: express.Request) => {
  // Prioritize APP_URL from env, otherwise try to detect from request
  let origin = process.env.APP_URL;
  
  if (!origin && req) {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.get('host');
    origin = `${protocol}://${host}`;
  }

  // Fallback for development if everything fails
  if (!origin) origin = 'http://localhost:3000';

  const redirectUri = `${origin.replace(/\/$/, '')}/api/drive/callback`;
  
  console.log(`Redirect URI configurada: ${redirectUri}`);

  if (!process.env.GOOGLE_CLIENT_ID) {
    console.warn("GOOGLE_CLIENT_ID não configurado!");
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

// API routes FIRST
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Lazy-loaded Gemini AI client helper to avoid startup crashes if key is missing
let aiInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("A chave de API GEMINI_API_KEY não foi configurada no painel de Secrets do seu Workspace no AI Studio.");
    }
    aiInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiInstance;
}

// Supplier context-aware Gemini chat proxy
app.post("/api/supplier/gemini-chat", async (req, res) => {
  try {
    const { message, history = [], selectedDate, contextProducts = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "O campo 'message' é obrigatório." });
    }

    const ai = getGeminiClient();

    // Fabricate a hyper-focused context about the items the supplier is managing
    let contextExplanation = "";
    if (contextProducts && contextProducts.length > 0) {
      contextExplanation = "\nVocê está atualmente acompanhando e preparando materiais para os seguintes produtos:\n" + 
        contextProducts.map((p: any) => `- **${p.name}** [Categoria: ${p.category || 'Geral'}]`).join("\n") + "\n";
    }
    if (selectedDate) {
      const formattedDate = selectedDate.split('-').reverse().join('/');
      contextExplanation += `A data de postagem selecionada no cronograma de preparo é ${formattedDate}.\n`;
    }

    const systemInstruction = `Você é o Assistente Virtual Gemini integrado ao Painel de Fornecedor (Supplier Panel) da plataforma Influency. Seu objetivo absoluto é ajudar o fornecedor (supplier) a preparar materiais de apoio excepcionais (áudios, vídeos de referência, hooks de engajamento, legendas e anotações para edição) para facilitar o trabalho dos editores.

${contextExplanation}
Quando interagir com o fornecedor, tente dar soluções fáceis e pragmáticas para criação de conteúdo orgânico ou pago, focando em plataformas de vídeos curtos (TikTok, Reels, Shorts). 

Algumas tarefas que você realiza com perfeição:
1. Gerar ganchos textuais (hooks) matadores e títulos magnéticos de acordo com os produtos listados.
2. Escrever notas instrutivas claras, detalhadas e estruturadas em tópicos para os editores (para que o fornecedor cole nas 'Observações de Produção' se quiser).
3. Sugerir ideias de áudios em alta ou ritmos de som adequados ao produto.
4. Escrever legendas prontas com hashtags estratégicas para as contas.

Instruções adicionais de formato:
- Seja prestativo, empático, direto e use uma formatação limpa baseada em Markdown (negritos, listas e sub-tópicos).
- NÃO use saudações robóticas ou introduções longas desnecessárias, vá direto ao ponto para economizar o tempo do usuário.
- Se o usuário perguntar algo fora do contexto de criação ou administração de produtos, reponda cordialmente mas tente reconduzir ao objetivo do painel.
- Fale e responda estritamente em Português do Brasil de forma natural e engajante.`;

    // Map history to SDK format
    const contents = history.map((item: any) => ({
      role: item.role === 'model' ? 'model' : 'user',
      parts: [{ text: item.text }]
    }));

    // Append the user's latest message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    console.log(`[Gemini Chat] Query received from supplier. History length: ${history.length}`);
    
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
    });

    const replyText = response.text || "Desculpe, não consegui obter uma resposta do Gemini no momento.";
    return res.json({ text: replyText });
  } catch (error: any) {
    console.error("[Gemini Chat] Error:", error);
    return res.status(500).json({ 
      error: error.message || "Erro inesperado ao consultar o Gemini.",
      hint: "Certifique-se de ter configurado a chave GEMINI_API_KEY corretamente."
    });
  }
});

// TikTok domain verification file
app.get("/tiktokuNp5rNoLssKAvPfoLVSPYYapZeJlrBGk.txt", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("tiktok-developers-site-verification=uNp5rNoLssKAvPfoLVSPYYapZeJlrBGk");
});

// Helper to ensure JSON error response
const sendJsonError = (res: express.Response, error: any, status = 500) => {
  console.error("API Error:", error);
  res.status(status).json({ 
    error: typeof error === 'string' ? error : (error.message || "Erro interno no servidor"),
    code: error.code || 'unknown',
    stack: process.env.NODE_ENV !== "production" ? error.stack : undefined
  });
};

// Profile Proxy to bypass client connectivity issues
app.get("/api/profile/:profileId", async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: "Banco de dados não inicializado no servidor." });
  }
  try {
    const { profileId } = req.params;
    console.log(`[Proxy] Fetching profile: ${profileId}`);
    const docRef = db.collection('user_profiles').doc(profileId);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      res.json({ exists: true, data: docSnap.data() });
    } else {
      res.json({ exists: false });
    }
  } catch (error: any) {
    console.error("Error fetching profile from server:", error);
    // Include the original error code and message for UI debugging
    res.status(500).json({ 
      error: error.message, 
      code: error.code || 'unknown',
      details: "Se este erro persistir, verifique se o Banco de Dados Firestore foi provisionado no console do Firebase."
    });
  }
});

app.post("/api/profile/:profileId", async (req, res) => {
  if (!db) {
    return res.status(500).json({ error: "Banco de dados não inicializado no servidor." });
  }
  try {
    const { profileId } = req.params;
    const data = req.body;
    
    // Add server-side timestamp
    const profileData = {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: data.createdAt ? data.createdAt : FieldValue.serverTimestamp()
    };

    await db.collection('user_profiles').doc(profileId).set(profileData);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error saving profile from server:", error);
    res.status(500).json({ error: error.message });
  }
});

// Global error handler for API routes
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global API Error handler:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ 
    error: err.message || "Erro desconhecido no servidor",
    code: err.code || 'unknown'
  });
});

// TikTok API signature helper
const generateTikTokSign = (path: string, params: Record<string, any>, appSecret: string) => {
  const sortedKeys = Object.keys(params).sort();
  let signString = path;
  sortedKeys.forEach(key => {
    signString += key + params[key];
  });
  signString = appSecret + signString + appSecret;
  return crypto.createHmac('sha256', appSecret).update(signString).digest('hex');
};

const pkceStates = new Map<string, string>(); // state -> code_verifier

const base64urlEncode = (buffer: Buffer): string => {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

// TikTok OAuth flow
app.get("/api/tiktok/callback", (req, res) => {
  const { code, state } = req.query;
  console.log("[TikTok Shop OAuth Callback]", { code, state });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Autorização TikTok</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px;">
        <h1>Autorização TikTok realizada com sucesso</h1>
      </body>
    </html>
  `);
});

app.get("/api/tiktok/creator-auth-url", (req, res) => {
  const appKey = process.env.TIKTOK_APP_KEY;
  const authBaseUrl = "https://shop.tiktok.com/alliance/creator/auth";
  const state = (req.query.state as string) || crypto.randomBytes(16).toString("hex");

  if (!appKey) {
    return res.json({
      configured: false,
      error: "TIKTOK_APP_KEY nao esta configurado.",
    });
  }

  try {
    const authUrl = new URL(authBaseUrl);

    // TikTok Shop Creator authorization uses app_key and state, not Login Kit params.
    authUrl.searchParams.delete("client_key");
    authUrl.searchParams.delete("response_type");
    authUrl.searchParams.delete("redirect_uri");
    authUrl.searchParams.delete("scope");
    authUrl.searchParams.delete("code_challenge");
    authUrl.searchParams.delete("code_challenge_method");

    authUrl.searchParams.set("app_key", appKey);
    authUrl.searchParams.set("state", state);

    const authParams = Object.fromEntries(authUrl.searchParams.entries());
    console.log("[TikTok Shop Creator Auth URL] Final URL:", authUrl.toString());
    console.log("[TikTok Shop Creator Auth URL] Params:", authParams);

    return res.json({
      configured: true,
      url: authUrl.toString(),
      state,
      authParams,
    });
  } catch (error) {
    console.error("[TikTok Shop Creator Auth URL] Invalid auth URL:", error);
    return res.json({
      configured: false,
      error: "URL de autorizacao TikTok Shop Creator invalida.",
    });
  }
});

app.get("/api/auth/tiktok/url", (req, res) => {
  const appKey = process.env.TIKTOK_APP_KEY;
  if (!appKey) {
    return res.status(500).json({ error: "TIKTOK_APP_KEY não está configurado." });
  }

  // Preserve state from frontend (user.uid) or generate random
  const state = (req.query.state as string) || crypto.randomBytes(16).toString("hex");
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${protocol}://${req.get('host')}/api/auth/tiktok/callback`;

  // Standard TikTok Consumer (Creator) OAuth v2 with correct PKCE
  const codeVerifier = base64urlEncode(crypto.randomBytes(32));
  const codeChallenge = base64urlEncode(crypto.createHash('sha256').update(codeVerifier).digest());

  // Store code_verifier in memory mapped by state
  pkceStates.set(state, codeVerifier);

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${appKey}&scope=user.info.basic%20creator.affiliate.info&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  
  console.log(`[TikTok OAuth] Generating Login Kit auth URL for client_key=${appKey}, state=${state}. URL: ${authUrl}`);
  res.json({ url: authUrl });
});

app.get("/api/auth/tiktok/callback", async (req, res) => {
  const authCode = req.query.code || req.query.auth_code;
  const state = req.query.state as string;
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;

  if (!authCode) {
    return res.status(400).send("Nenhum auth_code/code recebido do TikTok.");
  }

  if (!appKey || !appSecret) {
    return res.status(500).send("TIKTOK_APP_KEY ou TIKTOK_APP_SECRET não configurados no servidor.");
  }

  // Retrieve code verifier for PKCE validation
  const codeVerifier = state ? pkceStates.get(state) : null;
  if (state) {
    pkceStates.delete(state);
  }

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const redirectUri = `${protocol}://${req.get('host')}/api/auth/tiktok/callback`;

    const urlParams = new URLSearchParams({
      client_key: appKey,
      client_secret: appSecret,
      code: authCode as string,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    if (codeVerifier) {
      urlParams.append("code_verifier", codeVerifier);
    } else {
      console.warn(`[TikTok OAuth] Warning: No code_verifier found for state ${state}. Token exchange might fail.`);
    }

    console.log(`[TikTok OAuth] Exchanging code for access_token on open.tiktokapis.com...`);
    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: urlParams
    });

    const data = await response.json();
    console.log("[TikTok OAuth] Response from open.tiktokapis.com token exchange:", data);

    if (!data) {
      throw new Error("Resposta de token vazia recebida do TikTok.");
    }

    // Capture standard OAuth values or wrapped data values
    const accessToken = data.access_token || data.data?.access_token;
    const refreshToken = data.refresh_token || data.data?.refresh_token;
    const openId = data.open_id || data.data?.open_id;

    if (!accessToken) {
      const errMsg = data.error_description || data.error || data.message || JSON.stringify(data);
      throw new Error(`O servidor do TikTok retornou erro na troca de token: ${errMsg}`);
    }

    // Try fetching the real creator details using User Info API
    let creatorName = "Criador TikTok";
    try {
      console.log("[TikTok OAuth] Fetching profile information optionally...");
      const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,avatar_url", {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const userData = await userRes.json();
      console.log("[TikTok OAuth] User Profile details:", userData);
      if (userData && userData.data && userData.data.user) {
        creatorName = userData.data.user.display_name || userData.data.user.username || creatorName;
      }
    } catch (err: any) {
      console.warn("[TikTok OAuth] Bypassed optional user profile fetch:", err.message);
    }

    const tiktokData = JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      shop_id: openId || "affiliate_account",
      open_id: openId,
      seller_name: creatorName,
      creator_name: creatorName
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'OAUTH_AUTH_SUCCESS', 
                service: 'tiktok_shop',
                data: ${tiktokData}
              }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autenticação concluída com sucesso! Esta janela fechará sozinha.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Error exchanging TikTok token:", error);
    res.status(500).send(`
      <html>
        <body style="font-family: -apple-system, system-ui, sans-serif; padding: 2rem; background: #fff5f5; color: #c53030; text-align: center;">
          <div style="max-width: 500px; margin: 40px auto; background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #fed7d7;">
            <h2 style="margin-top: 0; color: #c53030;">Falha na Conexão do TikTok</h2>
            <p style="text-align: left; background: #f7fafc; padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 13px; color: #742a2a; overflow-x: auto;">
              <strong>Erro:</strong> ${error.message}
            </p>
            <p style="color: #4a5568; font-size: 14px; text-align: left; line-height: 1.5;">
              Certifique-se de que os seus secrets <strong>TIKTOK_APP_KEY</strong> (usado como client_key) e <strong>TIKTOK_APP_SECRET</strong> configurados nas configurações do AI Studio batem exatamente com o seu aplicativo do TikTok Login Kit.
            </p>
            <button onclick="window.close()" style="margin-top: 1rem; padding: 0.6rem 1.5rem; border: none; background: #e53e3e; color: white; font-weight: bold; border-radius: 8px; cursor: pointer; width: 100%;">Fechar Janela</button>
          </div>
        </body>
      </html>
    `);
  }
});

app.get("/api/tiktok/sync-orders", async (req, res) => {
  const { access_token } = req.query;
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;

  if (!access_token || !appKey || !appSecret) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  try {
    // Affiliate Order Search endpoint (V2)
    const path = "/api/v2/affiliate/order/search";
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, any> = {
      app_key: appKey,
      timestamp: timestamp,
    };

    const sign = generateTikTokSign(path, params, appSecret);
    const url = `https://api.tiktok-shop.com${path}?app_key=${appKey}&timestamp=${timestamp}&sign=${sign}`;
    
    // Search for orders in the last 30 days
    const body = { 
      page_size: 20 
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': access_token as string
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.code !== 0) throw new Error(data.message || "Failed to fetch affiliate orders");

    res.json(data.data);
  } catch (error: any) {
    console.error("Error syncing affiliate orders:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/tiktok/sync-showcase", async (req, res) => {
  const { access_token, simulate } = req.query;
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;

  // If simulate is 'true' or we don't have API keys, we return simulation data representing the affiliate showcase
  if (simulate === 'true' || !appKey || !appSecret || !access_token) {
    console.log("Simulating TikTok showcase products");
    return res.json({
      products: [
        {
          product_id: "tiktok_showcase_1",
          title: "Travesseiro Cervical Ortopédico Alivio de Dores",
          price: {
            min_price: "189.90",
            currency: "BRL"
          },
          cover_image: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=500&q=80",
          product_url: "https://shop.tiktok.com/view/product/showcase_1",
          commission_info: {
            commission_rate: "15.00",
            commission_value: "28.48"
          },
          category: "Saúde & Bem-Estar"
        },
        {
          product_id: "tiktok_showcase_2",
          title: "Mini Processador de Alimentos USB Recarregável",
          price: {
            min_price: "49.90",
            currency: "BRL"
          },
          cover_image: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=500&q=80",
          product_url: "https://shop.tiktok.com/view/product/showcase_2",
          commission_info: {
            commission_rate: "20.00",
            commission_value: "9.98"
          },
          category: "Cozinha"
        },
        {
          product_id: "tiktok_showcase_3",
          title: "Umidificador de Ar Ultrassônico com LED Colorido",
          price: {
            min_price: "79.90",
            currency: "BRL"
          },
          cover_image: "https://images.unsplash.com/photo-1519183071298-a2962feb14f4?w=500&q=80",
          product_url: "https://shop.tiktok.com/view/product/showcase_3",
          commission_info: {
            commission_rate: "12.00",
            commission_value: "9.58"
          },
          category: "Decoração"
        }
      ]
    });
  }

  try {
    const path = "/api/v2/affiliate/product/search";
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, any> = {
      app_key: appKey,
      timestamp: timestamp,
    };

    const sign = generateTikTokSign(path, params, appSecret);
    const url = `https://api.tiktok-shop.com${path}?app_key=${appKey}&timestamp=${timestamp}&sign=${sign}`;

    const body = {
      page_size: 50
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': access_token as string
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(data.message || "Failed to fetch showcase products from TikTok");
    }

    res.json(data.data);
  } catch (error: any) {
    console.error("Error syncing TikTok showcase:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/tiktok/sync-saved", async (req, res) => {
  const { access_token, simulate } = req.query;
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;

  // Since saved products are retrieved via Affiliate's Selection Center (not the public showcase/vitrine),
  // we either simulate them with high quality selection products, or fetch via selection API.
  if (simulate === 'true' || !appKey || !appSecret || !access_token) {
    console.log("Simulating TikTok saved products (Selection Center)");
    return res.json({
      products: [
        {
          product_id: "tiktok_saved_1",
          title: "Garrafa Térmica Inteligente com Sensor de Temperatura Digital",
          price: {
            min_price: "89.90",
            currency: "BRL"
          },
          cover_image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500&q=80",
          product_url: "https://shop.tiktok.com/view/product/saved_1",
          commission_info: {
            commission_rate: "20.00",
            commission_value: "17.98"
          },
          category: "Lar & Cozinha"
        },
        {
          product_id: "tiktok_saved_2",
          title: "Mini Seladora de Embalagens Portátil Magnética",
          price: {
            min_price: "29.90",
            currency: "BRL"
          },
          cover_image: "https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=500&q=80",
          product_url: "https://shop.tiktok.com/view/product/saved_2",
          commission_info: {
            commission_rate: "22.00",
            commission_value: "6.58"
          },
          category: "Lar & Organização"
        },
        {
          product_id: "tiktok_saved_3",
          title: "Suporte Veicular MagSafe por Indução com LED",
          price: {
            min_price: "129.90",
            currency: "BRL"
          },
          cover_image: "https://images.unsplash.com/photo-1586105251261-72a756497a11?w=500&q=80",
          product_url: "https://shop.tiktok.com/view/product/saved_3",
          commission_info: {
            commission_rate: "20.00",
            commission_value: "25.98"
          },
          category: "Acessórios"
        },
        {
          product_id: "tiktok_saved_4",
          title: "Dispensador de Sabonete Automático com Espuma",
          price: {
            min_price: "69.90",
            currency: "BRL"
          },
          cover_image: "https://images.unsplash.com/photo-1603533867307-b3542a5f3255?w=500&q=80",
          product_url: "https://shop.tiktok.com/view/product/saved_4",
          commission_info: {
            commission_rate: "20.00",
            commission_value: "13.98"
          },
          category: "Banheiro & Higiene"
        },
        {
          product_id: "tiktok_saved_5",
          title: "Afiador de Facas Profissional Anatômico de 3 Estágios",
          price: {
            min_price: "39.90",
            currency: "BRL"
          },
          cover_image: "https://images.unsplash.com/photo-1594582315729-19fc777a8809?w=500&q=80",
          product_url: "https://shop.tiktok.com/view/product/saved_5",
          commission_info: {
            commission_rate: "20.00",
            commission_value: "7.98"
          },
          category: "Utilidades Domésticas"
        }
      ]
    });
  }

  try {
    // NOTE (Developer Review - Item 7):
    // POST /api/v2/affiliate/product/search with selection_status="SELECTED" is our current implementation.
    // If you find that this endpoint does not fully correspond to the saved/favorited list on the TikTok app,
    // please authorize and use the TikTok Shop API Testing Tool to test other affiliate sub-scopes.
    // E.g., check if "/api/v2/affiliate/showcase/products/get" or "/api/v2/affiliate/selection/products/get"
    // is more appropriate, and replace the path below as needed.
    
    console.log("[TikTok Sync Saved] Intended sync requested. Checking against Selection Center API.");

    const path = "/api/v2/affiliate/product/search";
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, any> = {
      app_key: appKey,
      timestamp: timestamp,
    };

    const sign = generateTikTokSign(path, params, appSecret);
    const url = `https://api.tiktok-shop.com${path}?app_key=${appKey}&timestamp=${timestamp}&sign=${sign}`;

    // Query selection center
    const body = {
      page_size: 50,
      selection_status: "SELECTED" // representing selected/saved in affiliate center
    };

    console.log(`[TikTok Sync Saved] Posting search request to TikTok Shop Open API: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': access_token as string
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.code !== 0) {
      console.warn(`[TikTok Sync Saved] TikTok Shop API returned code ${data.code}: ${data.message}`);
      throw new Error(data.message || "Failed to fetch selection products from TikTok");
    }

    res.json(data.data);
  } catch (error: any) {
    console.error("Error syncing TikTok saved products:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Se este erro ocorrer com as chaves oficiais, utilize o API Testing Tool do TikTok Shop para validar se o afiliado possui produtos salvos e verifique o endpoint exato de retorno."
    });
  }
});

// Google Drive Routes - Global Only
app.get("/api/drive/status", async (req, res) => {
  if (!db) return res.status(500).json({ error: "DB not initialized" });
  try {
    // We only check the global setting now
    const globalDoc = await db.collection('settings').doc('google_drive').get();
    const isGlobalConfigured = globalDoc.exists && globalDoc.data()?.refresh_token;

    res.json({ configured: isGlobalConfigured });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/drive/auth-url", (req, res) => {
  const oauth2Client = getOAuth2Client(req);
  
  // We always use 'global' state now
  const state = 'global';

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state: state
  });
  res.json({ url });
});

app.get("/api/drive/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("No code provided");

  try {
    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code as string);
    console.log("Tokens received from Google OAuth for Global Drive");
    
    if (tokens.refresh_token) {
      if (!db) {
        throw new Error("Firestore database not initialized on server");
      }
      
      console.log(`Saving tokens to settings/google_drive...`);
      
      try {
        await db.collection('settings').doc('google_drive').set({
          ...tokens,
          updatedAt: FieldValue.serverTimestamp(),
          isGlobal: true
        });
        console.log(`Tokens salvos com sucesso no banco global.`);
      } catch (err: any) {
        console.error("Erro ao salvar tokens no Firestore:", err);
        throw new Error(`Erro ao salvar no banco de dados: ${err.message}`);
      }
      
      res.send(`
        <html>
          <head><meta charset="UTF-8"></head>
          <body>
            <script>
              alert('Google Drive GLOBAL configurado com sucesso! Agora todos os uploads usarão esta conta.');
              window.location.href = '/';
            </script>
          </body>
        </html>
      `);
    } else {
      console.warn("No refresh_token received");
      res.send("Erro: Não recebemos o refresh token. Tente desvincular o app no seu Google Account (Security -> Third-party apps) e tente novamente, ou use uma janela anônima.");
    }
  } catch (error: any) {
    console.error("Error in Drive callback:", error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

app.post("/api/drive/upload", upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const { parentId, fileName } = req.body;

  try {
    if (!db) throw new Error("DB not initialized");
    
    // Auth logic: Always use global tokens
    const globalDoc = await db.collection('settings').doc('google_drive').get();
    const tokens = globalDoc.exists ? globalDoc.data() : null;

    if (!tokens || !tokens.refresh_token) {
      throw new Error("Google Drive não configurado no servidor. O administrador precisa conectar o Drive primeiro.");
    }

    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const fileMetadata = {
      name: fileName || req.file.originalname,
      parents: parentId ? [parentId] : []
    };
    
    const media = {
      mimeType: req.file.mimetype,
      body: fs.createReadStream(req.file.path)
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, name'
    } as any);

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json(response.data);
  } catch (error: any) {
    console.error("Upload error:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        const safeName = String(fileName || req.file.originalname || 'upload')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]+/g, '_')
          .replace(/^_+|_+$/g, '') || 'upload';
        const localName = `${Date.now()}_${safeName}`;
        const localPath = path.join(localUploadsDir, localName);
        fs.renameSync(req.file.path, localPath);

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.get('host');
        const webViewLink = `${protocol}://${host}/uploads/${encodeURIComponent(localName)}`;
        console.warn(`[Upload] Drive falhou (${error.message}). Arquivo salvo localmente em ${webViewLink}`);
        return res.json({
          id: `local_${localName}`,
          webViewLink,
          name: safeName,
          provider: 'local_server',
          warning: `Google Drive indisponivel: ${error.message}`
        });
      } catch (fallbackError: any) {
        console.error("Local upload fallback error:", fallbackError);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({
          error: `Falha no upload. Drive: ${error.message}. Fallback local: ${fallbackError.message}`,
          code: error.code || 'upload_failed'
        });
      }
    }
    res.status(500).json({ error: error.message, code: error.code || 'upload_failed' });
  }
});

app.post("/api/drive/folder", async (req, res) => {
  const { name, parentId } = req.body;
  console.log(`[Drive] Request to get/create global folder: ${name}`, { parentId });
  
  try {
    if (!db) {
      console.error("[Drive] Firestore not initialized");
      return res.status(500).json({ error: "Banco de dados não inicializado no servidor." });
    }

    const globalDoc = await db.collection('settings').doc('google_drive').get();
    const tokens = globalDoc.exists ? globalDoc.data() : null;

    if (!tokens || !tokens.refresh_token) {
      console.warn("[Drive] No global refresh token found");
      return res.status(401).json({ error: "Google Drive não configurado. O administrador precisa conectar o Drive primeiro." });
    }

    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Check if folder exists
    console.log(`[Drive] Searching for folder: ${name}`);
    const escapedName = name.replace(/'/g, "\\'");
    const q = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentId ? ` and '${parentId}' in parents` : ''}`;
    const listRes = await drive.files.list({ q, fields: 'files(id, name)' });
    
    if (listRes.data.files && listRes.data.files.length > 0) {
      console.log(`[Drive] Folder found: ${listRes.data.files[0].id}`);
      return res.json(listRes.data.files[0]);
    }

    console.log(`[Drive] Folder not found, creating: ${name}`);
    const fileMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : []
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, name'
    } as any);

    console.log(`[Drive] Folder created: ${response.data.id}`);
    res.json(response.data);
  } catch (error: any) {
    console.error("[Drive] Folder creation error:", error);
    console.warn(`[Drive] Usando pasta local virtual para ${name} porque o Drive falhou: ${error.message}`);
    res.json({
      id: `local_${String(name || 'uploads').replace(/[^a-zA-Z0-9._-]+/g, '_')}`,
      name: name || 'uploads',
      provider: 'local_server',
      warning: `Google Drive indisponivel: ${error.message}`
    });
  }
});

app.get("/api/drive/download", async (req, res) => {
  const { fileId } = req.query;
  if (!fileId) return res.status(400).json({ error: "No fileId provided" });

  try {
    if (!db) {
      return res.status(500).json({ error: "Banco de dados não inicializado no servidor." });
    }

    const globalDoc = await db.collection('settings').doc('google_drive').get();
    const tokens = globalDoc.exists ? globalDoc.data() : null;

    if (!tokens || !tokens.refresh_token) {
      return res.status(401).json({ error: "Google Drive não configurado no servidor. O administrador do sistema precisa conectar o Drive primeiro." });
    }

    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const metadataRes = await drive.files.get({
      fileId: String(fileId),
      fields: 'name, mimeType'
    });

    const fileName = metadataRes.data.name || 'video_pronto.mp4';
    const mimeType = metadataRes.data.mimeType || 'video/mp4';

    const fileStreamRes = await drive.files.get(
      { fileId: String(fileId), alt: 'media' },
      { responseType: 'stream' }
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    fileStreamRes.data.pipe(res);
  } catch (error: any) {
    console.error("[Drive Download Error]", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  console.log("Starting server and initializing database...");
  await initializeDb();
  
  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server listening on ${HOST}:${PORT}`);
  });
}

startServer();
