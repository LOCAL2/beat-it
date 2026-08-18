export default async function handler(req, res) {
  const { path, ...restQuery } = req.query;
  
  if (!path) {
    return res.status(400).json({ error: 'Missing path' });
  }

  // Reconstruct the search params
  const searchParams = new URLSearchParams(restQuery).toString();
  const queryStr = searchParams ? `?${searchParams}` : '';
  
  const targetUrl = `https://unsplash.com/napi/${path}${queryStr}`;
  
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    
    // Return error directly if not ok to avoid json parse error
    if (!response.ok) {
        return res.status(response.status).json({ error: response.statusText });
    }

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
