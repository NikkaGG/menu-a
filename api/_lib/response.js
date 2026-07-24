function json(response, statusCode, body, headers = {}) {
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, String(value));
  }
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof response.status === 'function' && typeof response.json === 'function') {
    return response.status(statusCode).json(body);
  }
  response.statusCode = statusCode;
  return response.end(JSON.stringify(body));
}

function methodNotAllowed(response, methods) {
  response.setHeader('Allow', methods.join(', '));
  return json(response, 405, { error: 'Method not allowed' });
}

module.exports = { json, methodNotAllowed };
