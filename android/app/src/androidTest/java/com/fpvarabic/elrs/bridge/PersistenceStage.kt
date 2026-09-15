package com.fpvarabic.elrs.bridge

/**
 * Marks a test that is one stage of the update-persistence proof.
 *
 * These are deliberately order-dependent and are driven by the job one class
 * and one method at a time, across two separately installed APKs: seeding state
 * under candidate A and reading it back under candidate B. Running either on its
 * own, or both in the ordinary suite, would prove nothing and fail — so the
 * ordinary suite excludes this annotation and the job selects it by name.
 */
@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.FUNCTION, AnnotationTarget.CLASS)
annotation class PersistenceStage
