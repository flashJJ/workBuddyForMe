import { ApiError } from '@wbfm/shared/errors';
import { canonicalJson, type CapabilityManifest } from '@wbfm/shared/schemas';
import {
  compareCapabilityVersions,
  type CapabilityUpgradeDirection,
} from './upgrade-types';

/** v2.14：版本方向判定与降级 / 修复确认协议（纯函数，不触文件系统） */

export interface UpgradeDirectionOptions {
  currentVersion: string;
  confirmDowngrade?: boolean;
  expectedVersion?: string;
  repair?: boolean;
}

function checksumsChanged(
  oldManifest: CapabilityManifest,
  nextManifest: CapabilityManifest,
): boolean {
  return canonicalJson(oldManifest.checksums) !== canonicalJson(nextManifest.checksums);
}

export function assertUpgradeDirection(
  oldManifest: CapabilityManifest,
  nextManifest: CapabilityManifest,
  options: UpgradeDirectionOptions,
): CapabilityUpgradeDirection {
  const compared = compareCapabilityVersions(nextManifest.version, options.currentVersion);
  if (compared === null) throw ApiError.validation(`版本格式非法：${nextManifest.version}`);

  if (compared > 0) return 'upgrade';
  if (compared === 0) {
    const repairable = checksumsChanged(oldManifest, nextManifest);
    if (!options.repair) {
      throw new ApiError(
        'CAPABILITY_VERSION_NOT_NEWER',
        `版本未变化：当前 ${options.currentVersion}，包内 ${nextManifest.version}`,
        {
          targetVersion: nextManifest.version,
          currentVersion: options.currentVersion,
          repairAvailable: repairable,
        },
      );
    }
    if (!repairable) {
      throw new ApiError(
        'CAPABILITY_VERSION_NOT_NEWER',
        `版本与内容均未变化，无需修复安装：${nextManifest.version}`,
        {
          targetVersion: nextManifest.version,
          currentVersion: options.currentVersion,
          repairAvailable: false,
        },
      );
    }
    return 'repair';
  }

  if (!options.confirmDowngrade) {
    throw new ApiError(
      'CAPABILITY_DOWNGRADE_CONFIRM_REQUIRED',
      `目标版本 ${nextManifest.version} 低于当前 ${options.currentVersion}，请确认降级`,
      { targetVersion: nextManifest.version, currentVersion: options.currentVersion },
    );
  }
  if (options.expectedVersion !== nextManifest.version) {
    throw new ApiError(
      'CAPABILITY_DOWNGRADE_TARGET_MISMATCH',
      `降级确认的目标版本不一致：确认 ${options.expectedVersion ?? '(未提供)'}，包内 ${nextManifest.version}`,
      {
        targetVersion: nextManifest.version,
        expectedVersion: options.expectedVersion ?? null,
      },
    );
  }
  return 'downgrade';
}
