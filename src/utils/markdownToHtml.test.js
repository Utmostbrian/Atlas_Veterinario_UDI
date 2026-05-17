import { describe, it, expect } from 'vitest'
import { markdownToHtml } from './markdownToHtml'

describe('markdownToHtml', () => {
  it('devuelve string vacío para input vacío', () => {
    expect(markdownToHtml('')).toBe('')
    expect(markdownToHtml(null)).toBe('')
    expect(markdownToHtml(undefined)).toBe('')
  })

  it('escapa etiquetas HTML — previene XSS', () => {
    expect(markdownToHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    )
    expect(markdownToHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    )
  })

  it('escapa ampersands', () => {
    expect(markdownToHtml('A & B')).toBe('A &amp; B')
  })

  it('convierte negrita (**texto**)', () => {
    expect(markdownToHtml('**hola**')).toBe('<strong>hola</strong>')
  })

  it('convierte cursiva (*texto*)', () => {
    expect(markdownToHtml('*hola*')).toBe('<em>hola</em>')
  })

  it('convierte código inline (`texto`)', () => {
    expect(markdownToHtml('`código`')).toBe('<code>código</code>')
  })

  it('convierte encabezados ## y ###', () => {
    expect(markdownToHtml('## Título')).toBe('<h2>Título</h2>')
    expect(markdownToHtml('### Subtítulo')).toBe('<h3>Subtítulo</h3>')
  })

  it('convierte lista con guiones en <ul><li>', () => {
    const result = markdownToHtml('- item uno\n- item dos')
    expect(result).toContain('<li>item uno</li>')
    expect(result).toContain('<li>item dos</li>')
    expect(result).toContain('<ul>')
  })

  it('no permite HTML de IA en negrita — escapa antes de sustituir', () => {
    // Si la IA devuelve <b>texto</b> no debe renderizarse como HTML
    expect(markdownToHtml('<b>hola</b>')).toBe('&lt;b&gt;hola&lt;/b&gt;')
  })

  it('convierte lista numerada en <ol><li>', () => {
    const result = markdownToHtml('1. primer paso\n2. segundo paso\n3. tercer paso')
    expect(result).toContain('<li>primer paso</li>')
    expect(result).toContain('<li>segundo paso</li>')
    expect(result).toContain('<li>tercer paso</li>')
    expect(result).toContain('<ol>')
  })

  it('maneja lista mixta de viñetas y texto', () => {
    const result = markdownToHtml('* elemento con asterisco\n- elemento con guión')
    expect(result).toContain('<li>elemento con asterisco</li>')
    expect(result).toContain('<li>elemento con guión</li>')
  })

  it('convierte saltos de línea dobles en separadores visuales', () => {
    const result = markdownToHtml('Párrafo uno.\n\nPárrafo dos.')
    expect(result).toBe('Párrafo uno.<br><br>Párrafo dos.')
  })

  it('convierte saltos de línea simples en <br>', () => {
    const result = markdownToHtml('Línea uno.\nLínea dos.')
    expect(result).toBe('Línea uno.<br>Línea dos.')
  })
})
