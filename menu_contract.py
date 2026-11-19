"""Pure, conservative cleanup of extracted menu records.

This module does not translate or infer menu facts. The extractor supplies the
translation; this layer separates item prices and audit annotations from fields
that the approved menu template displays.
"""
from __future__ import annotations

import copy
import json
import re
import unicodedata


_DIAGNOSTIC = re.compile(
    r"图片(?:显示|中)|图中(?:显示|可见)|从(?:图片|图中)|菜单宣传页展示|菜单中文标注|菜单(?:中|上)?(?:中文)?标[注示]为|菜单仅写出菜名|"
    r"先前批次|之前批次|needs_verification|(?:请)?(?:询问|咨询)服务员|"
    r"(?:未标注|未提供|未注明|未标明|没有标注|未列出|未写|未说明|未用文字说明).{0,24}(?:编号|价格|原料|配料|成分|说明|信息|份量|容量|冷热|条件)|"
    r"(?:编号|价格|原料|配料|成分|份量|容量|冷热).{0,8}(?:未标注|未提供|未注明|未标明)|"
    r"(?:image (?:shows|appears)|not (?:listed|specified|provided)|ask (?:the )?(?:server|staff))",
    re.IGNORECASE,
)
_ABSENCE = re.compile(r"未标注|未提供|未注明|没有标注|未列出|未写|未说明|not (?:listed|specified|provided)", re.IGNORECASE)
_OPTIONAL = re.compile(r"编号|价格|原料|配料|成分|说明|份量|容量|冷热|order.?code|price|ingredients?|description", re.IGNORECASE)
_AMBIGUITY = re.compile(r"模糊|无法辨|看不清|字迹|歧义|冲突|图例|无法关联|关联不明|适用.{0,4}不明|具体位置待核对|ambiguous|illegible|unreadable|conflict|unclear", re.IGNORECASE)
_MEAL = re.compile(r"\b(?:ayce|all[ -]you[ -]can[ -]eat|adult|children?|kids?|toddler|senior|lunch|dinner|buffet|set\s+menu|meal|course)\b|套餐|放题|放題|自助|任食|成人|儿童|兒童|小童|幼童|长者|長者|午餐|晚餐|午市|晚市", re.IGNORECASE)
_SERVING = re.compile(r"(?<!\w)(?:per\s+)?(?:glass|pitcher|bottle|can|cup|shot|small|medium|large)(?!\w)|(?<!\w)\d+(?:\.\d+)?\s*(?:ml|oz|cl|l)(?!\w)|杯装|壶装|瓶装|罐装|小杯|大杯|小壶|大壶|每杯|每壶|每瓶", re.IGNORECASE)
_BEVERAGE = re.compile(r"\b(?:drink|beverage|cocktail|mocktail|beer|wine|sake|sour|soda|cola|juice|tea|coffee|lemonade|asahi|sapporo|kirin|soju)\b|饮品|饮料|雞尾酒|鸡尾酒|调酒|啤酒|清酒|葡萄酒|果汁|汽水|可乐|柠檬|茶|咖啡", re.IGNORECASE)
_GROUP_LABEL = re.compile(r"^(?:drinks?|beverages?|cocktails?|mocktails?|beer|wine|sake|soft drinks?|饮品|饮料|鸡尾酒|雞尾酒|调酒|啤酒|清酒|葡萄酒|软饮|汽水)$", re.IGNORECASE)
_PROMO = re.compile(r"\b(?:new|promotions?|featured|recommendations?|seasonal|limited\s+time)\b|新品|新菜|推荐|推薦|推广|推廣|促销|促銷|限时|限時|季节|季節", re.IGNORECASE)
_EXCEPTIONS = re.compile(r"\b(?:except|excluding|excludes|selected|only)\b|除外|不含|仅限|只限|指定", re.IGNORECASE)
_MONEY = re.compile(
    r"(?:(?:US|CA|AU|NZ|HK|SG)\$|[$€£¥￥₩]|\b(?:USD|CAD|AUD|NZD|HKD|SGD|EUR|GBP|CNY|RMB|JPY|KRW)\b)\s*\d[\d,]*(?:\.\d+)?"
    r"|\d[\d,]*(?:\.\d+)?\s*(?:美元|加元|澳元|欧元|英镑|人民币|日元|韩元|元)",
    re.IGNORECASE,
)


def money_values(text: str) -> set[str]:
    """Comparable literal money tokens; preserve currency and decimal marks."""
    return {re.sub(r"\s+", "", match.group()).casefold()
            for match in _MONEY.finditer(unicodedata.normalize("NFKC", text))}


def menu_money_values(menu: dict, *, charges_only: bool = False) -> set[str]:
    """Read printable facts only, never audit warnings, source URLs or usage."""
    fields = []
    for price in menu.get("pricing", []):
        fields.extend(price.get(key, "") for key in ("label", "value", "note"))
    for rule in menu.get("rules", []):
        fields.extend(rule.get(key, "") for key in ("label", "detail"))
    for category in menu.get("categories", []):
        for item in category.get("items", []):
            keys = ("price", "surcharge") if charges_only else (
                "original_name", "translated_name", "description", "price", "surcharge", "availability")
            fields.extend(item.get(key, "") for key in keys)
            if not charges_only:
                fields.extend(item.get("tags", []))
    return set().union(*(money_values(value) for value in fields)) if fields else set()


def _key(value: str) -> str:
    return re.sub(r"[\W_]+", "", unicodedata.normalize("NFKC", value).casefold())


def _text_key(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value).casefold())


def _sources(first: str, second: str) -> str:
    if not first:
        return second
    if not second or second in first.split(" / "):
        return first
    return first + " / " + second


def _append_value(first: str, second: str) -> str:
    if not first:
        return second
    if not second or (_text_key(second) in _text_key(first) and _amounts(second) <= _amounts(first)):
        return first
    if _text_key(second).startswith(_text_key(first)) and _amounts(first) <= _amounts(second):
        return second
    return first + " / " + second


def _clean_annotation(value: str) -> tuple[str, list[str]]:
    """Remove identifiable commentary clauses, never truncate arbitrary notes."""
    if not value or not _DIAGNOSTIC.search(value):
        return value, []
    kept, removed = [], []
    # Only item annotations enter this function. Rules and price notes retain
    # their exact text because a printed instruction can itself mention staff.
    for sentence in re.split(r"(?<=[。！？!?；;])|[\r\n]+", value):
        if not sentence.strip():
            continue
        clauses = re.split(r"，|(?<!\d),|,(?!\d)", sentence)
        # Once a sentence explicitly describes an image, subsequent visual
        # details do not become printed ingredients just because of a comma.
        visual = False
        for clause in clauses:
            clause = clause.strip()
            if not clause:
                continue
            visual |= bool(re.search(r"图片|图中|宣传页展示", clause))
            printed = re.search(r"并(?:提示|注明|要求)(.+)", clause)
            if printed and visual:
                kept.append(printed.group(1))
            (removed if visual or _DIAGNOSTIC.search(clause) else kept).append(clause)
    return "，".join(kept).strip("，,；; "), removed


def _absence_only(reason: str) -> bool:
    return bool(_ABSENCE.search(reason) and _OPTIONAL.search(reason) and not _AMBIGUITY.search(reason))


def _clean_items(menu: dict) -> None:
    for category in menu["categories"]:
        for item in category["items"]:
            removed = []
            for field in ("description", "availability"):
                item[field], annotations = _clean_annotation(item[field])
                removed.extend(annotations)
            tags = []
            for tag in item["tags"]:
                if _DIAGNOSTIC.search(tag):
                    removed.append(tag)
                else:
                    tags.append(tag)
            item["tags"] = tags
            names = [value for value in (item["original_name"], item["translated_name"], item["order_code"]) if value]
            relevant = [warning for warning in menu["warnings"] if any(name in warning for name in names) or re.search(r"全部菜品|所有菜品|每道菜|all items", warning, re.IGNORECASE)]
            reasons = relevant + removed
            if (item["needs_verification"] and any(_absence_only(reason) for reason in reasons)
                    and not any(_AMBIGUITY.search(reason) for reason in reasons)
                    and not _AMBIGUITY.search(item["source"])):
                item["needs_verification"] = False
            for annotation in removed:
                menu["warnings"].append(f"{item['original_name'] or item['translated_name']}：{annotation}")


def _is_promo(category: dict) -> bool:
    name = category["title"] + " " + category["subtitle"]
    return bool(_PROMO.search(name) or _key(name) in {"special", "specials", "特选", "特選"})


def _generic_drinks(category: dict) -> bool:
    return _key(category["title"]) in {"饮品", "饮料", "酒水"} or _key(category["subtitle"]) in {"drinks", "beverages"}


def _amounts(price: str) -> set[str]:
    return money_values(price)


def _same_dish(first: dict, second: dict, drink_alias: bool = False) -> bool:
    if first["original_name"] and second["original_name"]:
        if _key(first["original_name"]) != _key(second["original_name"]):
            return False
    elif not first["translated_name"] or _key(first["translated_name"]) != _key(second["translated_name"]):
        return False
    if any(_amounts(first[field]) != _amounts(second[field])
           for field in ("original_name", "translated_name")):
        return False
    if first["order_code"] and second["order_code"] and _key(first["order_code"]) != _key(second["order_code"]):
        return False
    # Empty monetary/availability fields are not evidence that a charged or
    # limited variant is identical to its unrestricted counterpart.
    if any(_text_key(first[field]) != _text_key(second[field]) for field in ("surcharge", "availability")):
        return False
    # Currency symbols, decimal points, signs and range separators carry facts.
    # Name matching may ignore punctuation; monetary/condition matching cannot.
    if _text_key(first["price"]) != _text_key(second["price"]):
        first_amounts, second_amounts = _amounts(first["price"]), _amounts(second["price"])
        if not (drink_alias and first_amounts and second_amounts
                and (first_amounts <= second_amounts or second_amounts <= first_amounts)
                and (_text_key(first["price"]) in _text_key(second["price"])
                     or _text_key(second["price"]) in _text_key(first["price"]))):
            return False
    if drink_alias:
        return True
    return not (first["description"] and second["description"]
                and _text_key(first["description"]) != _text_key(second["description"]))


def _merge_repeated_dishes(menu: dict) -> None:
    records = []
    # Actual food/drink categories win over repeated promotion pages even when
    # the promotion appeared first in the source document.
    for category in sorted(menu["categories"], key=lambda category: (_is_promo(category), _generic_drinks(category))):
        unique = []
        for item in category["items"]:
            def alias(old_category):
                return (_generic_drinks(category) != _generic_drinks(old_category)
                        and bool(_BEVERAGE.search(old_category["title"] + " " + old_category["subtitle"] + " " + category["title"] + " " + category["subtitle"])))
            previous = next((old for old_category, old in records
                             if (old_category is category or _is_promo(category) or _is_promo(old_category) or alias(old_category))
                             and _same_dish(old, item, alias(old_category))), None)
            if previous is None:
                unique.append(item)
                records.append((category, item))
                continue
            for field in ("original_name", "translated_name", "order_code", "description"):
                if not previous[field]:
                    previous[field] = item[field]
            previous["tags"] = list(dict.fromkeys(previous["tags"] + item["tags"]))
            if _amounts(item["price"]) > _amounts(previous["price"]):
                previous["price"] = item["price"]
            if item["description"] and _key(item["description"]) not in _key(previous["description"]):
                previous["description"] = _append_value(previous["description"], item["description"])
            previous["source"] = _sources(previous["source"], item["source"])
            previous["needs_verification"] |= item["needs_verification"]
        category["items"] = unique
    menu["categories"] = [category for category in menu["categories"] if category["items"]]


def _price_base(label: str) -> str:
    # Serving words are removed only to locate a matching existing item; their
    # original label is retained in that item's displayed price.
    return _key(_SERVING.sub("", label).strip(" /-–—:：()（）"))


def _price_text(entry: dict, names: list[str], scoped: bool = False) -> str:
    label, value, note = entry["label"].strip(), entry["value"].strip(), entry["note"].strip()
    if scoped:
        scope = re.sub(r"^(?:适用于|适用)(?:本页)?(?:所列|全部|所有|该类|本类)?", "", note).strip("。 .")
        if any(_key(scope) == _key(name) for name in names if name):
            note = ""
    variant = label
    for name in sorted(names, key=len, reverse=True):
        if name:
            variant = re.sub(re.escape(name), "", variant, flags=re.IGNORECASE).strip(" /-–—:：()（）")
    # A label that is merely the name is redundant. Any serving distinction or
    # other actual qualifier must accompany the amount instead of disappearing.
    if not variant or any(_key(label) == _key(name) for name in names):
        variant = ""
    result = " ".join(part for part in (variant, value) if part)
    return result + (f"（{note}）" if note else "")


def _attach_price(item: dict, entry: dict, names: list[str], scoped: bool = False) -> None:
    value = _price_text(entry, names, scoped)
    item["price"] = _append_value(item["price"], value)
    item["source"] = _sources(item["source"], entry["source"])


def _new_item_category(menu: dict, label: str) -> dict:
    beverage = bool(_BEVERAGE.search(label))
    existing = next((category for category in menu["categories"]
                     if _key(category["title"]) in ({"饮品", "饮料", "酒水"} if beverage else {"其他菜品"})
                     or _key(category["subtitle"]) in ({"drinks", "beverages"} if beverage else {"other"})), None)
    if existing is not None:
        return existing
    category = {"title": "饮品" if beverage else "其他菜品", "subtitle": "", "items": []}
    menu["categories"].append(category)
    return category


def _preserve_price_rule(menu: dict, entry: dict) -> None:
    """An unresolved scope must never hide an explicit charge in audit data."""
    if entry["value"].strip():
        menu["rules"].append({"label": entry["label"] or "收费", "detail": "；".join(value for value in (entry["value"], entry["note"]) if value), "source": entry["source"]})


def _relocate_item_prices(menu: dict) -> None:
    meal_prices = []
    for raw_entry in menu["pricing"]:
        entry = dict(raw_entry)
        entry["note"], annotations = _clean_annotation(entry["note"])
        for annotation in annotations:
            menu["warnings"].append(f"{entry['label']}：{annotation}")
        label = entry["label"].strip()
        label_key = _price_base(label)
        items = [item for category in menu["categories"] for item in category["items"]]
        exact = [item for item in items if _key(label) and _key(label) in {_key(item["original_name"]), _key(item["translated_name"])}]
        matches = exact or [item for item in items if label_key and label_key in {_key(item["original_name"]), _key(item["translated_name"])}]
        if matches:
            # Distinct paid or availability variants cannot be assigned a
            # generic price reliably. Keep the charge visible as a menu rule.
            conditions = {(_text_key(item["surcharge"]), _text_key(item["availability"])) for item in matches}
            if len(conditions) == 1:
                assigned = False
                for item in matches:
                    amounts = _amounts(entry["value"])
                    compatible = (amounts <= _amounts(item["price"]) if amounts
                                  else _text_key(entry["value"]) in _text_key(item["price"]))
                    if item["price"] and not _SERVING.search(label) and not compatible:
                        menu["warnings"].append("单品价格与已有收费不同，未自动合并：" + json.dumps(entry, ensure_ascii=False))
                        continue
                    _attach_price(item, entry, [item["original_name"], item["translated_name"]])
                    assigned = True
                if not assigned:
                    _preserve_price_rule(menu, entry)
            else:
                menu["warnings"].append("单品价格对应多个不同收费或适用条件的记录，未自动分配：" + json.dumps(entry, ensure_ascii=False))
                _preserve_price_rule(menu, entry)
            continue
        if _MEAL.search(label) and (not _BEVERAGE.search(label) or re.search(r"套餐|\bset\s+menu\b", label, re.IGNORECASE)):
            meal_prices.append(entry)
            continue
        # Explicit category-wide alcohol add-ons remain charges on those
        # cocktails, never another drink or a unified meal price.
        extra = re.search(r"\s+(?:extra|additional)\s+(\d+(?:\.\d+)?\s*oz)\s+alcohol\s*$", label, re.IGNORECASE)
        if extra:
            scope = _key(label[:extra.start()])
            scoped = [category for category in menu["categories"] if scope in {_key(category["title"]), _key(category["subtitle"])}]
            if scoped:
                for category in scoped:
                    for item in category["items"]:
                        item["surcharge"] = _append_value(item["surcharge"], f"{entry['value']} / {extra.group(1)} 酒精")
                        item["source"] = _sources(item["source"], entry["source"])
                continue
        categories = [category for category in menu["categories"]
                      if label_key and label_key in {_key(category["title"]), _key(category["subtitle"])}]
        if categories:
            if not _EXCEPTIONS.search(entry["note"]):
                for category in categories:
                    for item in category["items"]:
                        _attach_price(item, entry, [category["title"], category["subtitle"]], scoped=True)
            else:
                menu["warnings"].append("分类统一价格含有范围限制，未自动扩展：" + json.dumps(entry, ensure_ascii=False))
                _preserve_price_rule(menu, entry)
            continue
        if not label or _GROUP_LABEL.fullmatch(_SERVING.sub("", label).strip(" /-–—:：()（）")):
            menu["warnings"].append("未能关联的价格记录：" + json.dumps(entry, ensure_ascii=False))
            _preserve_price_rule(menu, entry)
            continue
        category = _new_item_category(menu, label)
        # A supplied Chinese label is usable as translated_name. English names
        # remain original_name; inventing a translation here would add facts.
        chinese = bool(re.search(r"[\u3400-\u9fff]", label))
        item = {"order_code": "", "original_name": "" if chinese else label,
                "translated_name": label if chinese else "", "description": "", "price": "",
                "surcharge": "", "availability": "", "tags": [], "source": entry["source"], "needs_verification": False}
        _attach_price(item, entry, [label])
        category["items"].append(item)
    menu["pricing"] = meal_prices


def _move_literal_campaigns(menu: dict) -> None:
    for category in menu["categories"]:
        kept = []
        for item in category["items"]:
            name = item["original_name"] or item["translated_name"]
            if (_is_promo(category) and _key(name) in {"freesoftdrink", "freesoftdrinks", "免费软饮", "免费汽水"}
                    and not item["order_code"] and not item["price"] and not item["surcharge"]):
                detail = "；".join(value for value in (item["translated_name"] or "免费软饮", item["description"], item["availability"]) if value)
                menu["rules"].append({"label": "饮品活动", "detail": detail, "source": item["source"]})
            else:
                kept.append(item)
        category["items"] = kept


def normalize_menu(menu: dict) -> dict:
    """Return final menu records without mutating provider responses."""
    result = copy.deepcopy(menu)
    _clean_items(result)
    _relocate_item_prices(result)
    _move_literal_campaigns(result)
    _merge_repeated_dishes(result)
    for count, item in enumerate((item for category in result["categories"] for item in category["items"]), 1):
        item["id"] = f"dish-{count}"
    result["warnings"] = list(dict.fromkeys(result["warnings"]))
    return result
