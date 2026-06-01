import express from 'express';
import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001; // Runs locally on port 5001

app.use(express.json());

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin) || allowedOrigins.length === 0) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-agent-token');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});


// Helper function to execute PowerShell commands
function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    exec(`powershell -Command "${command.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout || stderr);
      }
    });
  });
}

// Scrape helper using Axios and Cheerio
async function scrapeWebpage(url) {
  try {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);
    $('script, style, nav, footer, iframe, noscript, header, svg, link').remove();
    let text = $('body').text();
    text = text.replace(/\s+/g, ' ').trim();
    return text.substring(0, 15000);
  } catch (error) {
    console.error(`Scrape failed for ${url}:`, error.message);
    return `Error reading webpage: ${error.message}`;
  }
}

// Search helper querying DuckDuckGo HTML
async function searchWeb(query) {
  try {
    const response = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);
    const results = [];
    $('.result__body').each((i, el) => {
      if (i >= 5) return;
      const title = $(el).find('.result__title a').text().trim();
      const link = $(el).find('.result__url').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      results.push({ title, link, snippet });
    });
    return results;
  } catch (error) {
    console.error(`DuckDuckGo search failed for query "${query}":`, error.message);
    return [];
  }
}

// Helper to fetch latest emails from IMAP
function fetchLatestEmails(limit = 5) {
  return new Promise((resolve, reject) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      return reject(new Error("EMAIL_USER and EMAIL_PASS are not set in the .env file."));
    }

    const imap = new Imap({
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASS,
      host: process.env.EMAIL_HOST || 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    function openInbox(cb) {
      imap.openBox('INBOX', true, cb);
    }

    imap.once('ready', () => {
      openInbox((err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        const total = box.messages.total;
        if (total === 0) {
          imap.end();
          return resolve([]);
        }

        const startRange = Math.max(1, total - limit + 1);
        const f = imap.fetch(`${startRange}:${total}`, {
          bodies: '',
          struct: true
        });

        const emails = [];
        const promises = [];

        f.on('message', (msg) => {
          let rawMail = '';
          const mailPromise = new Promise((mailResolve) => {
            msg.on('body', (stream) => {
              stream.on('data', (chunk) => {
                rawMail += chunk.toString('utf8');
              });
            });
            msg.once('end', () => {
              simpleParser(rawMail)
                .then((parsed) => {
                  // Extract plain text and clean whitespace
                  let bodyText = parsed.text || parsed.textAsHtml || '';
                  bodyText = bodyText.replace(/\s+/g, ' ').substring(0, 1000); // snippet
                  
                  emails.push({
                    date: parsed.date,
                    from: parsed.from?.text || 'Unknown',
                    subject: parsed.subject || '(No Subject)',
                    body: bodyText
                  });
                  mailResolve();
                })
                .catch((err) => {
                  console.error("Failed to parse mail:", err);
                  mailResolve();
                });
            });
          });
          promises.push(mailPromise);
        });

        f.once('error', (err) => {
          console.error('Fetch error:', err);
        });

        f.once('end', () => {
          imap.end();
          Promise.all(promises).then(() => {
            emails.sort((a, b) => b.date - a.date);
            resolve(emails);
          });
        });
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

// Scrape Webpage Endpoint
app.post('/api/web-scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  console.log(`Scraping webpage: ${url}`);
  const text = await scrapeWebpage(url);
  res.json({ text });
});

// Search Web Endpoint
app.post('/api/web-search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });
  console.log(`Searching the web for: ${query}`);
  const results = await searchWeb(query);
  res.json({ results });
});

// Get Latest Emails Endpoint
app.get('/api/emails', async (req, res) => {
  console.log('Fetching latest emails...');
  try {
    const emails = await fetchLatestEmails(5);
    res.json({ success: true, emails });
  } catch (error) {
    console.error('Failed to get emails:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// System Control Endpoint
app.post('/api/system-control', async (req, res) => {
  const { action, arg } = req.body;
  console.log(`Received system control request: ${action}`, arg ? `with arg: ${arg}` : '');

  try {
    switch (action) {
      case 'open_app': {
        const appMap = {
          'notepad': 'notepad.exe',
          'calculator': 'calc.exe',
          'chrome': 'chrome.exe',
          'paint': 'mspaint.exe',
          'explorer': 'explorer.exe',
          'vscode': 'code.cmd',
          'cmd': 'cmd.exe',
          'powershell': 'powershell.exe'
        };
        const exe = appMap[arg.toLowerCase()] || arg;
        try {
          const child = spawn(exe, [], {
            detached: true,
            stdio: 'ignore',
            shell: true
          });
          child.unref();
          return res.json({ success: true, message: `Successfully spawned ${arg}` });
        } catch (err) {
          console.error(`Failed to spawn app ${arg}:`, err);
          return res.status(500).json({ error: err.message });
        }
      }

      case 'volume': {
        if (arg === 'up') {
          await runPowerShell("(New-Object -ComObject WScript.Shell).SendKeys([char]175)");
        } else if (arg === 'down') {
          await runPowerShell("(New-Object -ComObject WScript.Shell).SendKeys([char]174)");
        } else if (arg === 'mute') {
          await runPowerShell("(New-Object -ComObject WScript.Shell).SendKeys([char]173)");
        }
        return res.json({ success: true, message: `Volume adjustment: ${arg}` });
      }

      case 'media': {
        if (arg === 'play_pause') {
          await runPowerShell("(New-Object -ComObject WScript.Shell).SendKeys([char]179)");
        } else if (arg === 'next') {
          await runPowerShell("(New-Object -ComObject WScript.Shell).SendKeys([char]176)");
        } else if (arg === 'prev') {
          await runPowerShell("(New-Object -ComObject WScript.Shell).SendKeys([char]177)");
        }
        return res.json({ success: true, message: `Media control executed: ${arg}` });
      }

      case 'lock_pc': {
        exec('rundll32.exe user32.dll,LockWorkStation');
        return res.json({ success: true, message: 'PC locked successfully' });
      }

      case 'screenshot': {
        const desktopPath = path.join(process.env.USERPROFILE, 'Desktop');
        const filename = `screenshot_${Date.now()}.png`;
        const filepath = path.join(desktopPath, filename);
        
        const psScript = `Add-Type -AssemblyName System.Windows.Forms; $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height; $graphic = [System.Drawing.Graphics]::FromImage($bitmap); $graphic.CopyFromScreen($screen.X, $screen.Y, 0, 0, $bitmap.Size); $bitmap.Save('${filepath.replace(/\\/g, '\\\\')}'); $graphic.Dispose(); $bitmap.Dispose()`;
        await runPowerShell(psScript);
        return res.json({ success: true, message: `Screenshot saved to Desktop as ${filename}` });
      }

      case 'type_text': {
        const tempFile = path.join(process.cwd(), 'temp_type.txt');
        try {
          fs.writeFileSync(tempFile, arg, 'utf8');
          const psScript = `Get-Content -Raw -Path '${tempFile.replace(/'/g, "''")}' | Set-Clipboard; $ws = New-Object -ComObject WScript.Shell; $activated = $false; foreach ($title in @('Notepad', 'Untitled', 'Visual Studio Code', 'Word', 'Document')) { if ($ws.AppActivate($title)) { $activated = $true; break } }; if ($activated) { Start-Sleep -Milliseconds 400 } else { Start-Sleep -Milliseconds 200 }; $ws.SendKeys('^v')`;
          await runPowerShell(psScript);
          fs.unlinkSync(tempFile);
        } catch (err) {
          console.error("Error in clipboard typing simulation:", err);
          try { fs.unlinkSync(tempFile); } catch {}
          return res.status(500).json({ error: err.message });
        }
        return res.json({ success: true, message: 'Text typed successfully' });
      }

      case 'run_cmd': {
        exec(arg, (err) => {
          if (err) console.error(err);
        });
        return res.json({ success: true, message: `Executed command: ${arg}` });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error) {
    console.error('System control error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ─── Weather API (free, no key needed) ──────────────────────────────────────
app.get('/api/weather', async (req, res) => {
  const city = req.query.city || 'Multan';
  try {
    const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 6000 });
    const current = response.data.current_condition[0];
    res.json({
      city,
      temp_c: current.temp_C,
      temp_f: current.temp_F,
      description: current.weatherDesc[0].value,
      humidity: current.humidity,
      feels_like: current.FeelsLikeC,
    });
  } catch (e) {
    res.status(500).json({ error: 'Weather unavailable right now.' });
  }
});

// ─── Local Agent Proxy (forwards to naina-agent running on laptop) ───────────
const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL;
const LOCAL_AGENT_TOKEN = process.env.LOCAL_AGENT_TOKEN;

async function callAgent(endpoint, data = {}, method = 'POST') {
  if (!LOCAL_AGENT_URL) throw new Error('Local agent not configured');
  const res = await axios({
    url: `${LOCAL_AGENT_URL}${endpoint}`,
    method,
    headers: { 'Content-Type': 'application/json', 'x-agent-token': LOCAL_AGENT_TOKEN },
    data: method !== 'GET' ? data : undefined,
    timeout: 8000,
  });
  return res.data;
}

app.get('/api/agent/status', async (req, res) => {
  try {
    const status = await callAgent('/health', {}, 'GET');
    res.json({ online: true, ...status });
  } catch (e) {
    res.json({ online: false });
  }
});

app.post('/api/agent/volume', async (req, res) => {
  try { res.json(await callAgent('/volume', req.body)); }
  catch (e) { res.status(503).json({ error: 'Local agent offline. Run node agent.js on your laptop.' }); }
});

app.post('/api/agent/screenshot', async (req, res) => {
  try { res.json(await callAgent('/screenshot', {}, 'POST')); }
  catch (e) { res.status(503).json({ error: 'Local agent offline.' }); }
});

app.post('/api/agent/type', async (req, res) => {
  try { res.json(await callAgent('/type', req.body)); }
  catch (e) { res.status(503).json({ error: 'Local agent offline.' }); }
});

app.post('/api/agent/open', async (req, res) => {
  try { res.json(await callAgent('/open', req.body)); }
  catch (e) { res.status(503).json({ error: 'Local agent offline.' }); }
});

app.get('/api/agent/emails', async (req, res) => {
  try { res.json(await callAgent(`/emails?count=${req.query.count || 5}`, {}, 'GET')); }
  catch (e) { res.status(503).json({ error: 'Local agent offline or Gmail not configured.' }); }
});
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Naina backend running on port ${PORT}`);
});
