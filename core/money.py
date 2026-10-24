"""Money helpers: Decimal everywhere, currency on each amount, no floats."""
from decimal import ROUND_HALF_UP, Decimal

TWO_PLACES = Decimal("0.01")
CENTS = Decimal("100")


def D(value) -> Decimal:
    """Coerce anything (str/int/float/Decimal) to a 2dp Decimal. Never keep floats."""
    if isinstance(value, Decimal):
        return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    return Decimal(str(value)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def money(value) -> Decimal:
    """Alias of D for readability at call sites."""
    return D(value)


def add(*values) -> Decimal:
    total = Decimal("0.00")
    for v in values:
        total += D(v)
    return total


def mul(qty, unit_price) -> Decimal:
    return (D(qty) * D(unit_price)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def sub(a, b) -> Decimal:
    return D(a) - D(b)


def to_cents(value) -> int:
    """Integer cents — for storage/backends that prefer ints."""
    return int((D(value) * CENTS).to_integral_value(ROUND_HALF_UP))


def from_cents(cents: int) -> Decimal:
    return (Decimal(cents) / CENTS).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def vat_from_gross(gross, rate) -> Decimal:
    """VAT portion of a tax-INCLUSIVE amount: gross - gross/(1+rate/100)."""
    gross, rate = D(gross), D(rate)
    if rate == 0:
        return Decimal("0.00")
    net = gross / (Decimal(1) + rate / Decimal(100))
    return (gross - net).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def vat_added(net, rate) -> Decimal:
    """Tax-EXCLUSIVE: VAT added on top of net."""
    net, rate = D(net), D(rate)
    return (net * rate / Decimal(100)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def fmt(value, currency: str = "USD") -> str:
    """Human display: 'USD 12.50'."""
    return f"{currency} {D(value):,.2f}"
