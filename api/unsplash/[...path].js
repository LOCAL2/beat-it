export default async function handler(req, res) {
  const { path } = req.query;
  const pathStr = Array.isArray(path) ? path.join('/') : path;
  
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const searchParams = urlObj.search;
  
  const targetUrl = `https://unsplash.com/napi/${pathStr}${searchParams}`;
  
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
