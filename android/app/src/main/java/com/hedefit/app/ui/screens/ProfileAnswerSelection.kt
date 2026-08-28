package com.hedefit.app.ui.screens

private const val PROFILE_ANSWER_SEPARATOR = " • "

/** Multiple-choice profile answers stay backward-compatible as one stored string. */
internal fun selectedProfileChoices(answer: String): Set<String> = answer
    .split(PROFILE_ANSWER_SEPARATOR, ",")
    .map(String::trim)
    .filter(String::isNotBlank)
    .toSet()

/**
 * Toggles one option and writes choices in their visual order. An exclusive
 * option such as “Yok” clears all pain/injury entries and cannot coexist with
 * them.
 */
internal fun toggleProfileChoice(
    answer: String,
    choice: String,
    choices: List<String>,
    exclusiveChoice: String? = null,
): String {
    val selected = selectedProfileChoices(answer).toMutableSet()
    if (choice == exclusiveChoice) return choice
    exclusiveChoice?.let(selected::remove)
    if (!selected.add(choice)) selected.remove(choice)
    return choices.filter(selected::contains).joinToString(PROFILE_ANSWER_SEPARATOR)
}
