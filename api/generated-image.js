const IMAGE_FILES = {
  cheeseburger: '/assets/generated/chicken-cheeseburger.b64',
  grandburger: '/assets/generated/chicken-grandburger.b64',
};

module.exports = async function generatedImage(req, res) {
  const kind = req.query?.kind || new URL(req.url, 'http://localhost').searchParams.get('kind');
  const file = IMAGE_FILES[kind];
  if (!file) {
    res.statusCode = 404;
    res.end('Image not found');
    return;
  }

  try {
    const origin = `https://${req.headers.host}`;
    const response = await fetch(origin + file);
    if (!response.ok) throw new Error(`Failed to load ${file}`);
    const image = Buffer.from((await response.text()).trim(), 'base64');
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.statusCode = 200;
    res.end(image);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end('Failed to build image');
  }
};
