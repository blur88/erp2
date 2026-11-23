import {
  dockerStageImages,
  officialImagePin,
} from "../../../scripts/docker-image-pins.cjs";

// The reverse proxy pin also governs the frontend runtime image (#2039).
function exactNginxTag(image: string | undefined): string | undefined {
  const pin = officialImagePin(image);
  if (
    pin?.repository === "nginx" &&
    /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pin.tag)
  ) {
    return pin.tag;
  }
}

export function findNginxImageMisalignment(
  frontendDockerfile: string,
  proxyDockerfile: string,
): string | undefined {
  const frontend = exactNginxTag(dockerStageImages(frontendDockerfile).at(-1));
  const proxy = exactNginxTag(dockerStageImages(proxyDockerfile)[0]);
  if (!frontend)
    return "frontend/Dockerfile: final FROM must pin an exact NGINX tag";
  if (!proxy) return "nginx/Dockerfile: first FROM must pin an exact NGINX tag";
  if (frontend !== proxy) {
    return `frontend/Dockerfile nginx:${frontend} differs from nginx/Dockerfile nginx:${proxy}`;
  }
}
