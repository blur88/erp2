export function dockerStageImage(dockerfile: string, alias: string): string | undefined;
export function dockerStageImages(dockerfile: string): string[];
export function isComposeFile(file: string): boolean;
export function isDockerfile(file: string): boolean;
export function unresolvedDockerfileImages(dockerfile: string): string[];
export function officialImageRepository(image: string): string | undefined;
export function readRepositorySources(
  root: string,
  includesFile: (file: string) => boolean,
): Record<string, string>;

export function officialImagePin(image: string | undefined):
  | { repository: string; tag: string; pinnedDigest: string | undefined }
  | undefined;

export function officialImageReference(image: string | undefined):
  | { repository: string; tag: string; pinnedDigest: string | undefined }
  | { repository: string; tag: undefined; pinnedDigest: string }
  | undefined;
