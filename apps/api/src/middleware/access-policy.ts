const staff = ['Owner','Admin','Manager','SEO_Manager'];
export function routeAllowed(role: string, method: string, path: string): boolean {
  const read = method === 'GET' || method === 'HEAD';
  if (!['Owner','Admin','Manager','SEO_Manager','Analyst','Editor','Client','Viewer'].includes(role)) return false;
  if (path.startsWith('/api/v1/auth/')) return true;
  if (role === 'Client') {
    return read && (path === '/api/v1/organizations/current' || path === '/api/v1/projects' ||
      /^\/api\/v1\/projects\/[^/]+(?:\/|$)/.test(path) || path.startsWith('/api/v1/client-portal/') ||
      path === '/api/v1/integrations/status');
  }
  if (path.startsWith('/api/v1/gdpr/')) return true;
  if (path.startsWith('/api/v1/billing/')) return (read ? ['Owner','Admin'] : ['Owner']).includes(role);
  if (/^\/api\/v1\/(api-keys|webhooks|admin|backups|storage|observability)(\/|$)/.test(path)) return ['Owner','Admin'].includes(role);
  if (path.startsWith('/api/v1/organizations/')) return read || ['Owner','Admin'].includes(role);
  if (path.startsWith('/api/v1/integrations/')) return read && path.endsWith('/status') || ['Owner','Admin'].includes(role);
  if (path.startsWith('/api/v1/feature-flags')) return read || ['Owner','Admin'].includes(role);
  if (read) return true;
  if (/\/alerts\/[^/]+\/read$/.test(path)) return true;
  if (path.includes('/integrations/')) return staff.includes(role);
  if (method === 'DELETE') return ['Owner','Admin'].includes(role);
  if (/\/(crawl|rankings\/check|backlinks\/sync|pagespeed\/check|geo\/check|reports)$/.test(path)) return [...staff,'Analyst'].includes(role);
  if (path.startsWith('/api/v1/projects')) return [...staff,'Editor'].includes(role);
  if (path.startsWith('/api/v1/scheduler/')) return staff.includes(role);
  return false;
}
