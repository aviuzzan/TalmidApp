import type { SupabaseClient } from '@supabase/supabase-js'

export interface Attachment {
  name: string
  url: string
  size: number
  type: string
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 Mo
export const MAX_FILES_PER_MESSAGE = 5

/**
 * Upload de fichiers vers le bucket messages-attachments.
 * Path scheme: {thread_id}/{timestamp}-{random}-{safe_filename}
 * Retourne le tableau des pièces jointes (name, url, size, type).
 */
export async function uploadAttachments(
  supabase: SupabaseClient,
  threadId: string,
  files: File[]
): Promise<{ attachments: Attachment[]; errors: string[] }> {
  const attachments: Attachment[] = []
  const errors: string[] = []

  if (files.length > MAX_FILES_PER_MESSAGE) {
    errors.push(`Maximum ${MAX_FILES_PER_MESSAGE} fichiers par message`)
    return { attachments, errors }
  }

  for (const f of files) {
    if (f.size > MAX_FILE_SIZE) {
      errors.push(`${f.name} dépasse 10 Mo (${(f.size / 1024 / 1024).toFixed(1)} Mo)`)
      continue
    }
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100)
    const path = `${threadId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
    const { error } = await supabase.storage.from('messages-attachments').upload(path, f, {
      cacheControl: '3600',
      upsert: false,
    })
    if (error) {
      errors.push(`${f.name}: ${error.message}`)
      continue
    }
    const { data: signed } = await supabase.storage.from('messages-attachments').createSignedUrl(path, 60 * 60 * 24 * 365)
    attachments.push({
      name: f.name,
      url: signed?.signedUrl || path,
      size: f.size,
      type: f.type || 'application/octet-stream',
    })
  }
  return { attachments, errors }
}

export function fileIcon(type: string): string {
  if (type.startsWith('image/')) return '🖼️'
  if (type === 'application/pdf') return '📄'
  if (type.includes('word') || type.includes('document')) return '📝'
  if (type.includes('sheet') || type.includes('excel')) return '📊'
  if (type.startsWith('video/')) return '🎥'
  if (type.startsWith('audio/')) return '🎵'
  return '📎'
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' o'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' Ko'
  return (bytes / 1024 / 1024).toFixed(1) + ' Mo'
}
