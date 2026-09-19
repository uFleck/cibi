/**
 * PIX BR Code / EMV payload generator.
 * Produces a PIX "copia e cola" string valid in any Brazilian bank app.
 */

/**
 * CRC16-CCITT (polynomial 0x1021, initial value 0xFFFF).
 * Used for the mandatory CRC16 field (ID 63) in PIX BR Code.
 */
function crc16CCITT(data: string): string {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021
      } else {
        crc <<= 1
      }
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function emvField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0')
  return id + len + value
}

/**
 * Format amount as a string for field 54.
 * e.g. 12.50 -> "12.50" with length 05.
 * The value is the fixed-point decimal string.
 */
function formatAmount(amount: number): string {
  // Round to 2 decimal places, format with exactly 2 decimals
  const fixed = amount.toFixed(2)
  // Remove leading zeros but keep at least "0.00"
  // Actually PIX uses plain decimal string e.g. "12.50"
  // Format without unnecessary leading zeros but always with 2 decimals
  return fixed
}

/**
 * Generate a valid PIX BR Code payload string.
 *
 * @param pixKey - The recipient's PIX key (CPF, email, phone, random key)
 * @param amount  - Optional transaction amount in reais
 * @param merchantName - Recipient name (max 25 chars). Defaults to "CIBI"
 * @param city - City name (max 15 chars). Defaults to "SAO PAULO"
 * @returns Full PIX "copia e cola" string
 */
export function generatePixPayload(
  pixKey: string,
  amount?: number,
  merchantName: string = 'CIBI',
  city: string = 'SAO PAULO',
): string {
  // Sanitize inputs: truncate to max lengths per spec
  const name = merchantName.substring(0, 25).trim() || 'CIBI'
  const cityName = city.substring(0, 15).trim() || 'SAO PAULO'

  // Payload Format Indicator (ID 00)
  const payload = emvField('00', '01')

  // Merchant Account Info (ID 26)
  //   GUI subfield (00): br.gov.bcb.pix
  //   Key subfield (01): the PIX key
  const gui = emvField('00', 'br.gov.bcb.pix')
  const key = emvField('01', pixKey)
  const merchantAccountInfo = emvField('26', gui + key)

  // Merchant Category Code (ID 52)
  const mcc = emvField('52', '0000')

  // Transaction Currency (ID 53) — 986 = BRL
  const currency = emvField('53', '986')

  // Transaction Amount (ID 54) — optional
  let amountField = ''
  if (amount !== undefined && amount > 0) {
    const amountStr = formatAmount(amount)
    amountField = emvField('54', amountStr)
  }

  // Country Code (ID 58)
  const country = emvField('58', 'BR')

  // Merchant Name (ID 59)
  const merchant = emvField('59', name)

  // Merchant City (ID 60)
  const cityField = emvField('60', cityName)

  // Additional Data Field (ID 62) — reference label
  const additional = emvField('62', emvField('05', '***'))

  // Build payload without CRC
  const payloadWithoutCrc =
    payload +
    merchantAccountInfo +
    mcc +
    currency +
    amountField +
    country +
    merchant +
    cityField +
    additional +
    '6304'

  // Compute and append CRC16
  const crc = crc16CCITT(payloadWithoutCrc)
  return payloadWithoutCrc + crc
}
