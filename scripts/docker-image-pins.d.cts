export function dockerStageImages(dockerfile: string): string[];

export function officialImagePin(image: string | undefined):
  | { repository: string; tag: string; pinnedDigest: string | undefined }
  | undefined;

export function officialImageReference(image: string | undefined):
  | { repository: string; tag: string; pinnedDigest: string | undefined }
  | { repository: string; tag: undefined; pinnedDigest: string }
  | undefined;
