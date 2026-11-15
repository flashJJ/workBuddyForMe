// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  deleteImportedMusic,
  listImportedMusic,
  readImportedMusicBlob,
  saveImportedMusic,
} from '../music-storage';

const created: string[] = [];

function makeFile(name: string, content = 'audio'): File {
  return new File([content], name, { type: 'audio/mpeg' });
}

afterEach(async () => {
  for (const id of created.splice(0)) await deleteImportedMusic(id);
});

describe('导入歌曲本地存储（无 IndexedDB 时退回内存）', () => {
  it('保存后可列出、读取 Blob 并删除', async () => {
    const track = await saveImportedMusic(makeFile('我的主题曲.mp3'), 'warm');
    created.push(track.id);

    expect(track.source).toBe('imported');
    expect(track.title).toBe('我的主题曲');
    expect(track.fileName).toBe('我的主题曲.mp3');

    const list = await listImportedMusic();
    expect(list.some((item) => item.id === track.id)).toBe(true);

    const blob = await readImportedMusicBlob(track.id);
    expect(blob).not.toBeNull();
    expect(blob!.size).toBe(5);
    expect(blob!.type).toBe('audio/mpeg');

    await deleteImportedMusic(track.id);
    created.splice(created.indexOf(track.id), 1);
    const after = await listImportedMusic();
    expect(after.some((item) => item.id === track.id)).toBe(false);
  });

  it('空文件拒绝入库', async () => {
    await expect(saveImportedMusic(makeFile('empty.mp3', ''), 'calm')).rejects.toThrow('empty');
  });
});
