import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

import { SettingsController } from './settings.controller';

describe('SettingsController regional settings routes', () => {
  it('uses /settings/regional for the GET regional settings endpoint', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SettingsController)).toBe('settings');
    expect(Reflect.getMetadata(PATH_METADATA, SettingsController.prototype.getRegionalSettings)).toBe('regional');
    expect(Reflect.getMetadata(METHOD_METADATA, SettingsController.prototype.getRegionalSettings)).toBe(
      RequestMethod.GET,
    );
  });

  it('uses /settings/regional for the PUT regional settings endpoint', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SettingsController.prototype.updateRegionalSettings)).toBe('regional');
    expect(Reflect.getMetadata(METHOD_METADATA, SettingsController.prototype.updateRegionalSettings)).toBe(
      RequestMethod.PUT,
    );
  });
});
