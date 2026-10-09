//! PIX BR Code ("copia e cola") payload.

fn crc16(data: &str) -> String {
    let mut crc: u16 = 0xffff;
    for b in data.bytes() {
        crc ^= (b as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 { (crc << 1) ^ 0x1021 } else { crc << 1 };
        }
    }
    format!("{crc:04X}")
}

fn field(id: &str, value: &str) -> String {
    format!("{id}{:02}{value}", value.chars().count())
}

/// `amount` in reais (omitted when None or <= 0). The web defaults are name "CIBI", city "SAO PAULO".
pub fn generate_pix_payload(pix_key: &str, amount: Option<f64>, merchant_name: &str, city: &str) -> String {
    let trunc = |s: &str, n: usize, d: &str| {
        let t: String = s.chars().take(n).collect();
        if t.trim().is_empty() { d.to_string() } else { t.trim().to_string() }
    };
    let mut p = field("00", "01");
    p += &field("26", &(field("00", "br.gov.bcb.pix") + &field("01", pix_key)));
    p += &field("52", "0000");
    p += &field("53", "986");
    if let Some(a) = amount.filter(|a| *a > 0.0) {
        p += &field("54", &format!("{a:.2}"));
    }
    p += &field("58", "BR");
    p += &field("59", &trunc(merchant_name, 25, "CIBI"));
    p += &field("60", &trunc(city, 15, "SAO PAULO"));
    p += &field("62", &field("05", "***"));
    p += "6304";
    let crc = crc16(&p);
    p + &crc
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload() {
        assert_eq!(crc16("123456789"), "29B1"); // CRC-16/CCITT-FALSE check value
        let p = generate_pix_payload("a@b.com", Some(12.5), "CIBI", "SAO PAULO");
        assert!(p.starts_with("0002012629"));
        assert!(p.contains("0014br.gov.bcb.pix0107a@b.com"));
        assert!(p.contains("540512.50"));
        let (body, crc) = p.split_at(p.len() - 4);
        assert_eq!(crc16(body), crc);
        assert!(!generate_pix_payload("k", None, "", "").contains("5404"));
        assert!(generate_pix_payload("k", None, "  ", "").contains("5904CIBI6009SAO PAULO"));
    }
}
