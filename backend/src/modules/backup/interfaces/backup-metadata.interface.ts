export interface BackupMetadata {
  pgVersion?: string;
  redisVersion?: string;
  tables?: string[];
  settingsIncluded?: boolean;
  description?: string;
  checksum?: string;
  originalFilename?: string;
  uploadedAt?: string;
  systemInfo?: {
    nodeVersion: string;
    platform: string;
    hostname: string;
  };
}
