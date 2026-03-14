#!/usr/bin/env python3
"""
Thai Baht in Words — converts numeric amount to Thai text.
e.g. 169000 → 'หนึ่งแสนหกหมื่นเก้าพันบาทถ้วน'
"""

_ONES = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
_TENS = ['', 'สิบ', 'ยี่สิบ', 'สามสิบ', 'สี่สิบ', 'ห้าสิบ',
         'หกสิบ', 'เจ็ดสิบ', 'แปดสิบ', 'เก้าสิบ']
_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']


def _chunk_to_thai(n: int) -> str:
    """Convert integer 1–999999 to Thai words (no 'บาท')."""
    if n == 0:
        return ''
    if n < 0:
        return 'ลบ' + _chunk_to_thai(-n)

    result = ''
    digits = []
    tmp = n
    while tmp > 0:
        digits.append(tmp % 10)
        tmp //= 10

    # digits[0] = ones, digits[1] = tens, ...
    place_names = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

    for i in range(len(digits) - 1, -1, -1):
        d = digits[i]
        if d == 0:
            continue
        # Special case: 'เอ็ด' for ones place when tens ≥ 1 and ones = 1
        if i == 0 and d == 1 and len(digits) > 1 and digits[1] > 0:
            result += 'เอ็ด'
        # Special case: 'ยี่สิบ' already handled; 'สิบ' without prefix for 1
        elif i == 1 and d == 1:
            result += 'สิบ'
        else:
            result += _ONES[d] + place_names[i]

    return result


def baht_to_thai(amount: float) -> str:
    """
    Convert amount (float) to Thai words with บาทถ้วน / สตางค์.
    169000 → 'หนึ่งแสนหกหมื่นเก้าพันบาทถ้วน'
    """
    amount = round(amount, 2)
    if amount < 0:
        return 'ลบ' + baht_to_thai(-amount)
    if amount == 0:
        return 'ศูนย์บาทถ้วน'

    baht = int(amount)
    satang = round((amount - baht) * 100)

    result = ''

    # Handle millions
    if baht >= 1_000_000:
        millions = baht // 1_000_000
        result += _chunk_to_thai(millions) + 'ล้าน'
        baht %= 1_000_000

    if baht > 0:
        result += _chunk_to_thai(baht)

    result += 'บาท'

    if satang > 0:
        result += _chunk_to_thai(satang) + 'สตางค์'
    else:
        result += 'ถ้วน'

    return result


if __name__ == '__main__':
    tests = [
        (169000, 'หนึ่งแสนหกหมื่นเก้าพันบาทถ้วน'),
        (444000, 'สี่แสนสี่หมื่นสี่พันบาทถ้วน'),
        (191000, 'หนึ่งแสนเก้าหมื่นหนึ่งพันบาทถ้วน'),
        (1000000, 'หนึ่งล้านบาทถ้วน'),
        (1250000, 'หนึ่งล้านสองแสนห้าหมื่นบาทถ้วน'),
        (279000, 'สองแสนเจ็ดหมื่นเก้าพันบาทถ้วน'),
    ]
    for amount, expected in tests:
        got = baht_to_thai(amount)
        status = 'OK' if got == expected else f'FAIL (expected: {expected})'
        print(f'{amount:>10,} → {got} [{status}]')
