const IMAGE_PARTS = {
  cheeseburger: [
    '/assets/generated/chicken-cheeseburger.00.b64',
    '/assets/generated/chicken-cheeseburger.01.b64',
    '/assets/generated/chicken-cheeseburger.02.b64',
    '/assets/generated/chicken-cheeseburger.03.b64',
  ],
  grandburger: [
    '/assets/generated/chicken-grandburger.00.b64',
    '/assets/generated/chicken-grandburger.01.b64',
    '/assets/generated/chicken-grandburger.02.b64',
    '/assets/generated/chicken-grandburger.03.b64',
  ],
};

module.exports = async function generatedImage(req, res) {
  const kind = req.query?.kind || new URL(req.url, 'http://localhost').searchParams.get('kind');
  const parts = IMAGE_PARTS[kind];
  if (!parts) {
    res.statusCode = 404;
    res.end('Image not found');
    return;
  }

  try {
    const origin = `https://${req.headers.host}`;
    const chunks = await Promise.all(parts.map(async (part) => {
      const response = await fetch(origin + part);
      if (!response.ok) throw new Error(`Failed to load ${part}`);
      return (await response.text()).trim();
    }));
    const image = Buffer.from(chunks.join(''), 'base64');
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
