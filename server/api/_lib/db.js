let injectedQuery = null;

function createQuery({ databaseUrl = process.env.DATABASE_URL, neon } = {}) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const makeNeon = neon || require('@neondatabase/serverless').neon;
  const sql = makeNeon(databaseUrl);
  return (text, values = []) => sql.query(text, values);
}

function getQuery() {
  if (injectedQuery) return injectedQuery;
  return createQuery();
}

function setQueryForTests(query) {
  injectedQuery = query;
}

module.exports = { createQuery, getQuery, setQueryForTests };
