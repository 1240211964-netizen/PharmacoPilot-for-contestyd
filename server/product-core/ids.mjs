// 产品内核 ID 与时间工具。
// ID 形如 `xxx_<21 位 base62>`:前缀 2-5 个小写字母,主体用 crypto 无偏随机,
// 整体匹配 ^[a-z]{2,5}_[A-Za-z0-9]{21}$,与 schemas/v1 各 id pattern 兼容。
import { randomInt } from 'node:crypto';

const ID_BODY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_BODY_LENGTH = 21;
const PREFIX_PATTERN = /^[a-z]{2,5}$/;

export function newId(prefix) {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(`invalid id prefix "${prefix}"; expected ^[a-z]{2,5}$`);
  }
  let body = '';
  for (let i = 0; i < ID_BODY_LENGTH; i += 1) {
    body += ID_BODY_ALPHABET[randomInt(0, ID_BODY_ALPHABET.length)];
  }
  return `${prefix}_${body}`;
}

export function nowIso() {
  return new Date().toISOString();
}
