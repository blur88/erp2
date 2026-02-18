import { readFileSync } from 'fs';
import { join } from 'path';

describe('Backend Dockerfile security hardening', () => {
  const dockerfilePath = join(__dirname, '..', '..', 'Dockerfile');
  const dockerfileContent = readFileSync(dockerfilePath, 'utf8');

  it('removes npm and npx from runtime image after dependency installation', () => {
    expect(dockerfileContent).toContain('rm -rf /usr/local/lib/node_modules/npm');
    expect(dockerfileContent).toContain('rm -f /usr/local/bin/npm /usr/local/bin/npx');
  });

  it('starts app without relying on npx in container runtime', () => {
    expect(dockerfileContent).toContain('CMD ["node", "dist/main"]');
    expect(dockerfileContent).not.toContain('CMD ["npx"');
  });
});
