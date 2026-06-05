const dns = require('node:dns');
const net = require('node:net');
const { Pool } = require('pg');
const { parse } = require('pg-connection-string');

function shouldForcePgIpv4() {
  return process.env.PG_FORCE_IPV4 === 'true'
    || (process.env.NODE_ENV === 'production' && process.env.PG_FORCE_IPV4 !== 'false');
}

function resolvePgHost(host) {
  if (!host) return Promise.resolve(host);

  if (net.isIP(host)) {
    if (net.isIPv6(host)) {
      return Promise.reject(new Error(
        'SESSION_DATABASE_URL host is an IPv6 address. Use your Postgres hostname instead (e.g. Supabase pooler host).'
      ));
    }
    return Promise.resolve(host);
  }

  return new Promise((resolve, reject) => {
    dns.lookup(host, { family: 4, all: false }, (err, address) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

async function createSessionPool(connectionString) {
  if (!connectionString) return null;

  const parsed = parse(connectionString);
  const host = shouldForcePgIpv4()
    ? await resolvePgHost(parsed.host)
    : parsed.host;

  return new Pool({
    host,
    port: parsed.port ? Number(parsed.port) : undefined,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : parsed.ssl || undefined,
  });
}

module.exports = { createSessionPool, shouldForcePgIpv4 };
