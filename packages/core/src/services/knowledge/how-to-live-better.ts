import type { ContentPackDefinition, ContentPackFile } from './content-pack-types';

/**
 * v2.18 M4：HowToLiveBetter《高性价比人生指南》内容包。
 *
 * 许可 CC BY 4.0：不随应用分发正文，用户确认后从固定 commit 的 raw 文件下载；
 * 逐文件与整包 SHA-256 双重校验，任一不一致即整体拒绝、不建库。
 * 上游按 34 节拆分的 Markdown 原样导入，未改写正文。
 */
const REF = 'e2605d3e2242bd6216c9255192b8a8957a08c55a';
const RAW_BASE = `https://raw.githubusercontent.com/eternity4719/HowToLiveBetter/${REF}/book/`;

export const CONTENT_PACK_KB_ID = 'c0000000-0000-4000-8000-000000000004';

/** [文件名, 单文件 SHA-256, 字节数]；顺序即整包哈希的拼接顺序（上游 01–34 节） */
const FILES: ReadonlyArray<readonly [string, string, number]> = [
  ['01-不要早死.md', '93c19fe7041e1bca7b90d546b7279d2db11c7b139b9e6080745d280a0ffcf9fb', 161137],
  ['02-不要慢慢死.md', '930f23962a6ea7502840c4811c92d09c446087a489acb0a7681d925d7c70faca', 138831],
  ['03-不要浪费精力.md', 'c27a0980ff0c187d2a9250232dc5a5bdc74cb55a8117e515d68c939ef5a15140', 67581],
  ['04-不要浪费时间.md', '994c692778a36f5794acc09da73bd46fdc31b722a475d9e36fef097d79f7e98d', 29429],
  ['05-不要浪费钱.md', '5c01104902e6c8e9c56f2bb068a287a2a3f516483fc2245122bc28e76384da20', 151227],
  ['06-反面清单.md', '1380f1838f8fc1df5a9e029cd126d3b6d579ed9219487f2bc56cf336c0c40780', 131027],
  ['07-没钱的时候怎么活.md', '34d7dcce457efb1cea4576d4afcadb5cb45ad5fe2f756352eec893e35682ce00', 75472],
  ['08-别把自己搭进去.md', 'b3d5f749a02aba08333ac969a83cc1ec270ba472ea34db46b571760e1ce7cd5b', 153456],
  ['09-普通人容易踩的法律红线.md', '91e653956c2394ad8dbc0776f591011708dba8c19840ffc270cdcb94c6086407', 111286],
  ['10-恋爱和结婚划不划算.md', 'd72968d188bd351c734f42912ffb1280a8feada1881019fe893c74133a54d236', 63148],
  ['11-程序员和技术人容易踩的红线.md', 'b714586a48253575dbb0bdeaaf722a030827092402eb4680e7ce120bbe823b46', 65992],
  ['12-创业与做生意.md', '61b3e1076dbafae136dfa987b30274705a45052156a88e18698444467bed243e', 94182],
  ['13-紧急情况.md', '7cdd1f8ce7a2630b9909918efc4921796c671095153be1e1e20802c5aabe9493', 164858],
  ['14-账号与信息安全.md', 'cc519d91942dbbbbc5ae0c8f82bf9ee04ce1518ed67688abcbaee5754570b459', 29706],
  ['15-租房与买房.md', 'cee53cc83031b6571094b9308d947c30f3d4a1c0c687aa871a1d7e5e523d161e', 47119],
  ['16-得了慢性病之后怎么活.md', '5ff9b3c7d81ed866df82279b78655d8e25b14ea14ee2883b79cea21be85be703', 49358],
  ['17-家里有老人.md', 'c3b3d235bec679c2fa86988eb4e4b5c2ea7bbe5192986295e08f7e0b3ac62b63', 45237],
  ['18-养孩子划不划算.md', '04fb9acbadf2f4368f4063295229c0fe63136e2c5f35999df3ff7f248b615af5', 18104],
  ['19-在职离职和工伤.md', '3908c66940dae220d000456104a07dd13c8d56fe6bf746603e01b321a21d932b', 74829],
  ['20-刚出生的孩子怎么带.md', '1caa74ac8c347d9441e6e3be1a2b84402d52bc4bce53ea7b4f2525e70402f71e', 52304],
  ['21-出国旅行与境外安全.md', '912b20c1ffa8f23e496d89ee76aa5141f0ca0d5e98e73320f284ada19d73ca6e', 35916],
  ['22-怎么放松.md', '53b2b3d00a80652db08ee456eeb8cdd22c0540b886e4a48eb4d280faa6de2c83', 28137],
  ['23-学什么技能划算.md', '49f8fabc2de6c6de1bb078fe6ba7b7af69b258c7061cfbe7dba6796aa47f4667', 66804],
  ['24-看病.md', '2785b324c5936c407d05cf731b946ca0ff2e1775aaf13628f115624933a6e225', 48135],
  ['25-人走了以后要办什么.md', 'cd134c1913847a91813a098c9f71668cf6564dae1abfcd67edb157fa27150e72', 34270],
  ['26-做一个网站或平台.md', '9b1f769a62e52fa3feda4bd5c4864265d979b07d6a2bb8f38943c06a5a3923bc', 41712],
  ['27-怀孕和生产.md', '023998fb3353a694bbb9d8f69442dc20e2c92117521cc905b69692bedb56a1a2', 52117],
  ['28-别为了外形把身体搞坏.md', '8b1cf1b50200f4a73c9e4a094d16deaccf1c7141cf599d0e20adb8f9bedf5c78', 32845],
  ['29-遭遇重大打击之后.md', '5bc44e52e2d56f597e5d6eb7981807bde976878c8599a7f089ec8ca05ee09269', 42529],
  ['30-上学以后的孩子.md', 'd48096557795ba99bcaa91027ac639f36b4b9d4850dec9745fe9af8a885641da', 69947],
  ['31-十八岁之后有哪几条路.md', 'accccdd315e9653e1de8d29b6da72c59d430f845c7820996a9ff14c693d2fade', 77164],
  ['32-出国留学.md', 'b2550d774c77d66adbd3b079012a5a6b4010c4d2ee6d21446df2322b20e5045c', 28011],
  ['33-残疾之后怎么活.md', '410bc923e894cd8f70d407aef2ec16b04ab8976acfaa227827446fed12fd8226', 64643],
  ['34-家里的常备药别吃出事.md', 'c5e62c669d73444be0647e53f2e6f5f4ed1e2e1eafabd40c0470e939a4b917df', 38561],
];

const files: ContentPackFile[] = FILES.map(([filename, sha256, byteSize]) => ({
  filename,
  sha256,
  byteSize,
  url: `${RAW_BASE}${encodeURIComponent(filename)}`,
}));

export const HOW_TO_LIVE_BETTER: ContentPackDefinition = {
  id: 'how-to-live-better',
  name: '高性价比人生指南',
  description:
    '767 条循证生活建议：健康、意外急救、法律红线、财务、租房、婚育与养老。每条标注成本、收益与证据等级，回答引用「第 N 节第 M 条」。',
  sourceUrl: 'https://github.com/eternity4719/HowToLiveBetter',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  version: REF.slice(0, 7),
  publishedAt: '2026-10-21',
  sha256: '7095f7cb286a8ef634750251ef47db7c8de98ce4d5b22a36878ceab619ffff46',
  totalBytes: 2385074,
  targetKnowledgeBaseId: CONTENT_PACK_KB_ID,
  chunkSize: 600,
  chunkOverlap: 80,
  disclaimer:
    '内容仅按书检索与引用，不替代医生、律师或会计；急症、自杀念头或进行中的法律程序请先联系 120 / 110 / 12356 或当地机构。',
  files,
};
