import { describe, it, expect } from 'vitest'
import { toEffectiveConc } from './useDrugCalculator'

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
