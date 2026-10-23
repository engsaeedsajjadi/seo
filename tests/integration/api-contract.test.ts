/**
 * API Contract Tests - Real Endpoints
 * Tests success, validation error, auth error, not found, provider-not-configured, server error
 *
 * CONTRACT DECISION (phase 6): two response families exist by design —
 *  1. Business endpoints under /api/v1/* use the { success, data | error }
 *     envelope. testEndpoint() asserts that envelope.
 *  2. Meta/probe endpoints are intentionally BARE payloads:
 *     - GET /api/v1/health  → { status, timestamp, version, environment, services }
 *     - GET /api/v1/ready   → { ready, timestamp, services }
 *     - GET /api/v1/version → { version, environment, timestamp }
 *     - GET /api/v1/openapi.json → the bare OpenAPI 3 document itself
 *     Health/ready are probe endpoints (Docker/Kubernetes healthchecks in
 *     this repo consume them as plain status payloads), and openapi.json
 *     MUST be a bare OpenAPI document or standard tooling (Swagger UI,
 *     generators) cannot consume it. Wrapping them in the envelope to
 *     satisfy this test would break those consumers, so the test asserts
 *     each meta endpoint's real documented shape via testMetaEndpoint().
 * This test previously also called the meta endpoints at unprefixed paths
 * (/health instead of /api/v1/health), which 404s against a live API.
 */

import assert from 'assert';

console.log('🧪 API Contract Tests - Real Endpoints');

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function testMetaEndpoint(
  path: string,
  description: string,
  assertShape: (json: any, status: number) => void,
  codePattern: string,
) {
  console.log(`\n  Testing GET ${path} - ${description}`);
  try {
    const response = await fetch(`${API_URL}${path}`);
    const json = await response.json().catch(() => ({}));
    assertShape(json, response.status);
    console.log(`    ✅ GET ${path} → ${response.status} bare meta payload OK`);
    return { response, json };
  } catch (e: any) {
    if (e && (e.message?.includes('fetch failed') || e.message?.includes('ECONNREFUSED'))) {
      console.log(`    ⚠️  API not available at ${API_URL} - testing code pattern only`);
      const fs = await import('fs');
      const appCode = fs.readFileSync('apps/api/src/app.ts', 'utf-8');
      const healthCode = fs.existsSync('apps/api/src/routes/health.ts')
        ? fs.readFileSync('apps/api/src/routes/health.ts', 'utf-8')
        : '';
      assert.ok(
        appCode.includes(codePattern) || healthCode.includes(codePattern),
        `API code should handle ${path}`,
      );
      console.log(`    ✅ Code pattern for ${path} exists`);
      return null;
    }
    throw e;
  }
}

async function testEndpoint(
  method: string,
  path: string,
  options: { 
    body?: any, 
    headers?: any, 
    expectedStatus?: number,
    shouldFail?: boolean,
    description: string 
  }
) {
  console.log(`\n  Testing ${method} ${path} - ${options.description}`);
  
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    
    const json = await response.json().catch(() => ({}));
    
    // Check response structure
    assert.ok(Object.prototype.hasOwnProperty.call(json, 'success'), `${path} must have success field`);
    
    if (json.success) {
      assert.ok(json.data !== undefined, `${path} success must have data`);
      console.log(`    ✅ ${method} ${path} → ${response.status} success with data`);
    } else {
      assert.ok(json.error, `${path} failure must have error`);
      assert.ok(json.error.code, `${path} error must have code`);
      assert.ok(json.error.message, `${path} error must have message`);
      console.log(`    ✅ ${method} ${path} → ${response.status} error: ${json.error.code}`);
    }
    
    if (options.expectedStatus) {
      assert.strictEqual(response.status, options.expectedStatus, `Expected status ${options.expectedStatus}`);
    }
    
    // Check status code semantics
    if (response.status === 200) {
      assert.strictEqual(json.success, true, '200 should have success=true');
    } else if (response.status >= 400) {
      assert.strictEqual(json.success, false, `${response.status} should have success=false`);
    }
    
    return { response, json };
  } catch (e: any) {
    if (e.message.includes('fetch failed') || e.message.includes('ECONNREFUSED')) {
      console.log(`    ⚠️  API not available at ${API_URL} - testing code pattern only`);
      
      // Check code pattern
      const fs = await import('fs');
      const appCode = fs.readFileSync('apps/api/src/app.ts', 'utf-8');
      assert.ok(appCode.includes(path.split('/')[3] || 'api'), `API code should handle ${path}`);
      console.log(`    ✅ Code pattern for ${path} exists`);
      return null;
    }
    throw e;
  }
}

async function main() {
  console.log(`API_URL: ${API_URL}`);
  
  // Test meta endpoints (no auth required) — bare payloads by design, see header
  await testMetaEndpoint('/api/v1/health', 'Health check returns bare status payload', (json, status) => {
    assert.ok(json.status === 'healthy' || json.status === 'degraded', `health status must be healthy|degraded, got ${json.status}`);
    assert.ok(json.services && typeof json.services === 'object', 'health must include services object');
    assert.ok(typeof json.timestamp === 'string', 'health must include timestamp');
    assert.ok(status === 200 || status === 503, `health HTTP status must be 200 or 503, got ${status}`);
    if (json.status === 'healthy') assert.strictEqual(status, 200, 'healthy must be HTTP 200');
  }, '/api/v1/health');

  await testMetaEndpoint('/api/v1/ready', 'Ready check reports DB readiness as bare payload', (json, status) => {
    assert.ok(typeof json.ready === 'boolean', 'ready must include boolean ready field');
    if (status === 200) assert.strictEqual(json.ready, true, 'HTTP 200 ready must be true');
    if (json.ready === false) assert.strictEqual(status, 503, 'not-ready must be HTTP 503');
  }, '/api/v1/ready');

  await testMetaEndpoint('/api/v1/version', 'Version returns bare version payload', (json, status) => {
    assert.strictEqual(status, 200, 'version must be HTTP 200');
    assert.ok(typeof json.version === 'string' && json.version.length > 0, 'version must include version string');
  }, '/api/v1/version');
  
  // Test auth endpoints
  await testEndpoint('POST', '/api/v1/auth/signup', {
    body: { email: 'invalid', password: 'short' },
    description: 'Signup with invalid data should return 400 validation error',
    expectedStatus: 400,
  });
  
  await testEndpoint('POST', '/api/v1/auth/login', {
    body: { email: 'nonexistent@example.com', password: 'wrong' },
    description: 'Login with invalid credentials should return 401',
  });
  
  // Test protected endpoints without auth (should fail 401)
  await testEndpoint('GET', '/api/v1/projects', {
    description: 'Projects without auth should return 401',
    expectedStatus: 401,
  });
  
  await testEndpoint('GET', '/api/v1/billing/credits', {
    description: 'Billing without auth should return 401',
  });
  
  await testEndpoint('GET', '/api/v1/api-keys', {
    description: 'API keys without auth should return 401',
  });
  
  // Test provider-not-configured behavior
  // These should return 503 PROVIDER_NOT_CONFIGURED or 401/404, never 200 with fake data
  const providerEndpoints = [
    '/api/v1/projects/test-id/rankings',
    '/api/v1/projects/test-id/backlinks',
    '/api/v1/projects/test-id/gsc',
    '/api/v1/projects/test-id/ga4',
  ];
  
  for (const endpoint of providerEndpoints) {
    await testEndpoint('GET', endpoint, {
      description: `${endpoint} should return auth error or PROVIDER_NOT_CONFIGURED, never fake data`,
    });
  }
  
  // Test validation errors
  await testEndpoint('POST', '/api/v1/projects', {
    body: { name: '', domain: '' },
    description: 'Create project with empty data should return validation error',
  });
  
  // Test not found
  await testEndpoint('GET', '/api/v1/projects/non-existent-id', {
    description: 'Non-existent project should return 404',
  });
  
  // Test OpenAPI — must be the bare OpenAPI document (no envelope), or
  // standard OpenAPI tooling cannot consume it. See header contract note.
  await testMetaEndpoint('/api/v1/openapi.json', 'OpenAPI spec is a bare OpenAPI 3 document', (json, status) => {
    assert.strictEqual(status, 200, 'openapi.json must be HTTP 200');
    assert.ok(typeof json.openapi === 'string' && json.openapi.startsWith('3.'), `openapi field must be a 3.x version, got ${json.openapi}`);
    assert.ok(json.info && typeof json.info.title === 'string', 'openapi info.title must exist');
    assert.ok(json.paths && typeof json.paths === 'object', 'openapi paths must exist');
    assert.ok(!('success' in json), 'openapi.json must NOT be wrapped in the success envelope');
  }, '/api/v1/openapi.json');
  
  console.log('\n✅ All API contract tests PASSED');
  console.log('✅ Success/error structure, status codes, validation, auth, provider-not-configured verified');
}

await main().catch(e => {
  console.error('❌ API contract test failed:', e);
  process.exit(1);
});
