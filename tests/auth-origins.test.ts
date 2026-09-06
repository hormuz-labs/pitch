import { describe, expect, it } from 'vitest'
import { firstUrlInText, isAuthenticatedFor } from '../apps/web/src/lib/authOrigins'

describe('firstUrlInText', () => {
  it('finds explicit and bare URLs inside a prompt', () => {
    expect(firstUrlInText('Make a demo of https://app.example.com/dashboard.')).toBe(
      'https://app.example.com/dashboard',
    )
    expect(firstUrlInText('Create a launch film for trypitch.co')).toBe('https://trypitch.co/')
  })

  it('ignores emails and unfinished hostnames', () => {
    expect(firstUrlInText('Email person@example.com about localhost')).toBeNull()
    expect(firstUrlInText('Make a demo of https://trypitch.c')).toBeNull()
  })

  it('keeps finding the same URL as more prompt words are added', () => {
    expect(firstUrlInText('Make a demo of https://trypitch.co using the dashboard')).toBe(
      'https://trypitch.co/',
    )
  })
})

describe('isAuthenticatedFor', () => {
  it('matches saved logins across subdomains', () => {
    expect(isAuthenticatedFor('https://app.example.com', ['https://login.example.com'])).toBe(true)
  })
})
