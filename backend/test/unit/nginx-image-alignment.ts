export function findNginxImageMisalignment(
  frontendDockerfile: string,
  proxyDockerfile: string,
): string | undefined {
  const fromImages = (dockerfile: string) =>
    [...dockerfile.matchAll(/^\s*FROM\s+(?:--\S+\s+)*(\S+)/gim)].map(
      (match) => match[1],
    );
  const exactTag = (image: string | undefined) =>
    /^(?:(?:docker\.io\/)?library\/|docker\.io\/)?nginx:(\d+\.\d+\.\d+(?:-[\w.-]+)?)(?:@sha256:[a-f0-9]{64})?$/.exec(
      image ?? "",
    )?.[1];

  const frontend = exactTag(fromImages(frontendDockerfile).at(-1));
  const proxy = exactTag(fromImages(proxyDockerfile)[0]);
  if (!frontend)
    return "frontend/Dockerfile: final FROM must pin an exact NGINX tag";
  if (!proxy) return "nginx/Dockerfile: first FROM must pin an exact NGINX tag";
  if (frontend !== proxy) {
    return `frontend/Dockerfile nginx:${frontend} differs from nginx/Dockerfile nginx:${proxy}`;
  }
}
