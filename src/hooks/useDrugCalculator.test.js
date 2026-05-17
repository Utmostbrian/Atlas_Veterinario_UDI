import { describe, it, expect } from 'vitest'
import { toEffectiveConc, fmtNum } from './useDrugCalculator'

describe('toEffectiveConc', () => {
  it('devuelve el valor directamente para mg/mL', () => {
    expect(toEffectiveConc('50', 'mg/mL')).toBe(50)
  })

  it('devuelve el valor directamente para UI/mL', () => {
    expect(toEffectiveConc('100', 'UI/mL')).toBe(100)
  })

  it('convierte % a mg/mL (1% = 10 mg/mL)', () => {
    expect(toEffectiveConc('2', '%')).toBe(20)
    expect(toEffectiveConc('0.5', '%')).toBe(5)
    expect(toEffectiveConc('10', '%')).toBe(100)
  })

  it('convierte g/100mL a mg/mL (misma escala que %)', () => {
    expect(toEffectiveConc('5', 'g/100mL')).toBe(50)
  })

  it('devuelve null para valor 0', () => {
    expect(toEffectiveConc('0', 'mg/mL')).toBeNull()
  })

  it('devuelve null para valor negativo', () => {
    expect(toEffectiveConc('-5', 'mg/mL')).toBeNull()
  })

  it('devuelve null para string no numérico', () => {
    expect(toEffectiveConc('abc', 'mg/mL')).toBeNull()
    expect(toEffectiveConc('', 'mg/mL')).toBeNull()
  })

  it('maneja correctamente valores decimales', () => {
    expect(toEffectiveConc('2.5', 'mg/mL')).toBe(2.5)
    expect(toEffectiveConc('2.5', '%')).toBe(25)
  })
})

describe('fmtNum — M-01: adaptive precision', () => {
  it('usa 2 decimales para valores normales', () => {
    expect(fmtNum(1.5)).toBe('1.50')
    expect(fmtNum(25)).toBe('25.00')
    expect(fmtNum(0.1)).toBe('0.10')
  })

  it('usa 4 decimales para valores < 0.1 (microdosis)', () => {
    expect(fmtNum(0.05)).toBe('0.0500')
    expect(fmtNum(0.001)).toBe('0.0010')
  })

  it('usa 4 decimales para valores < 0.01 (previene "0.00")', () => {
    expect(fmtNum(0.0025)).toBe('0.0025')
    expect(fmtNum(0.0001)).toBe('0.0001')
  })

  it('devuelve "0.00" para 0 e Infinity', () => {
    expect(fmtNum(0)).toBe('0.00')
    expect(fmtNum(Infinity)).toBe('0.00')
    expect(fmtNum(NaN)).toBe('0.00')
  })
})
