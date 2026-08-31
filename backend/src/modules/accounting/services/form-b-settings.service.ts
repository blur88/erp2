import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormBSettings } from '../entities/form-b-settings.entity';
import { PrintSettingsService } from '../../print-settings/print-settings.service';
import { UpdateFormBSettingsDto } from '../dto/update-form-b-settings.dto';
import type { FormBIdentityField } from './form-b.types';

const FIELDS = ['businessName', 'registrationNumber', 'businessCode', 'activityType'] as const;
type IdentityField = (typeof FIELDS)[number];

/** '' and '   ' both mean absent. Never store or report them as a value. */
const blankToNull = (v: string | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
};

@Injectable()
export class FormBSettingsService {
  constructor(
    @InjectRepository(FormBSettings) private readonly repo: Repository<FormBSettings>,
    private readonly printSettings: PrintSettingsService,
  ) {}

  async getRaw(): Promise<FormBSettings> {
    const existing = await this.repo.findOne({ where: { id: true } as any });
    if (!existing) {
      throw new BadRequestException('Form B settings row is missing (migration not applied?)');
    }
    return existing;
  }

  /**
   * Effective identity with its provenance.
   *
   * ONLY businessName has a fallback. PrintSettings carries no registration
   * number — just companyName and a free-text miscInfo — and miscInfo must
   * NEVER be parsed for one: a regex over free text would produce a wrong
   * statutory identifier, which is worse than an empty one the filer is warned
   * about.
   */
  async resolve(): Promise<Record<IdentityField, FormBIdentityField>> {
    const [stored, print] = await Promise.all([
      this.getRaw(),
      this.printSettings.getSettings(),
    ]);

    const field = (override: string | null, fallback: string | null): FormBIdentityField => {
      if (override !== null) return { value: override, source: 'formB', override };
      if (fallback !== null) return { value: fallback, source: 'printSettings', override: null };
      return { value: null, source: null, override: null };
    };

    return {
      businessName: field(
        blankToNull(stored.businessName),
        blankToNull((print as any)?.companyName),
      ),
      registrationNumber: field(blankToNull(stored.registrationNumber), null),
      businessCode: field(blankToNull(stored.businessCode), null),
      activityType: field(blankToNull(stored.activityType), null),
    };
  }

  async update(dto: UpdateFormBSettingsDto): Promise<FormBSettings> {
    const current = await this.getRaw();
    const next: Record<string, unknown> = { ...current, id: true };

    // Only fields PRESENT in the body are touched; a whitespace-only value is
    // an explicit "clear this override", which re-engages the fallback.
    for (const key of FIELDS) {
      if (key in dto) next[key] = blankToNull((dto as any)[key]);
    }

    return this.repo.save(this.repo.create(next as any) as any);
  }
}
