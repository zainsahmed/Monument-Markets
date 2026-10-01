import { describe, expect, it } from 'vitest'
import { classify } from './classification'

const now = new Date('2026-10-01T12:00:00Z')
const future = '2026-10-10T12:00:00Z'
const past = '2026-09-20T12:00:00Z'
const c = (noticeTypeCode: string | null, over: Partial<Parameters<typeof classify>[0]> = {}) =>
  classify({ noticeTypeCode, active: true, responseDeadline: future, now, ...over }).label

describe('classify', () => {
  it('GREEN for active bid-type notices with a future deadline', () => {
    expect(c('o')).toBe('GREEN'); expect(c('k')).toBe('GREEN'); expect(c('dibbs_rfq')).toBe('GREEN')
  })
  it('YELLOW for bid-type notices with no deadline', () => {
    expect(c('o', { responseDeadline: null })).toBe('YELLOW')
    expect(c('k', { responseDeadline: null })).toBe('YELLOW')
  })
  it('YELLOW for research-type notices', () => {
    for (const code of ['r', 'p', 's', 'i']) expect(c(code)).toBe('YELLOW')
    expect(c(null)).toBe('YELLOW')
  })
  it('RED for awards and justifications — award notices are never bid opportunities', () => {
    expect(c('a')).toBe('RED'); expect(c('u')).toBe('RED')
    expect(c('a', { responseDeadline: null })).toBe('RED')
  })
  it('RED for inactive, cancelled or deadline passed', () => {
    expect(c('o', { active: false })).toBe('RED')
    expect(c('o', { cancelled: true })).toBe('RED')
    expect(c('o', { responseDeadline: past })).toBe('RED')
    expect(c('r', { responseDeadline: past })).toBe('RED')
  })
  it('explains the rule that fired', () => {
    expect(classify({ noticeTypeCode: 'a', active: true, responseDeadline: null, now }).rule).toMatch(/not a bid opportunity/i)
    expect(classify({ noticeTypeCode: 'o', active: true, responseDeadline: future, now }).rule).toMatch(/not a statement that your company is eligible/i)
  })
})
