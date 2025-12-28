export interface BackupMetadata {
  pgVersion?: string;
  mongoVersion?: string;
  redisVersion?: string;
  tables?: string[];
  collections?: string[];
  settingsIncluded?: boolean;
  description?: string;
  checksum?: string;
  uploadedAt?: string;
  systemInfo?: {
    nodeVersion: string;
    platform: string;
    hostname: string;
  };
}
