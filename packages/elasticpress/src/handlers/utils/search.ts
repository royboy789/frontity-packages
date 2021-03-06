import { AuthorEntity, TaxonomyEntity } from '@frontity/source/types';
import { State } from 'frontity/types';
import { EPAuthor, EPTerm, Packages } from '../../../types';

/**
 * Normalizes an author coming from ElasticPress into Frontity schema.
 *
 * @param epAuthor The author object coming from ElasticPress
 * @param state The frontity state
 *
 * @returns A normalized author
 */
export function normalizeAuthor(epAuthor: EPAuthor, state: State<Packages>): AuthorEntity {
	const apiRoot = state.source.api.replace('/wp-json', '');

	const link = epAuthor.link || `${apiRoot}/author/${epAuthor.login}`;

	return {
		id: epAuthor.id,
		slug: epAuthor.login,
		link,
		description: epAuthor.description || '',
		name: epAuthor.display_name,
		url: link,
		avatar_urls: epAuthor.avatar_urls || {},
	};
}

/**
 * Normalizes an term coming from ElasticPress into Frontity Schema
 *
 * @param taxonomy The taxonomy this term belongs to.
 * @param epTerm The ElasticPress term object.
 * @param state The frontity state.
 *
 * @returns A normnalized term
 */
export function normalizeTerm(
	taxonomy: string,
	epTerm: EPTerm,
	state: State<Packages>,
): TaxonomyEntity {
	const apiRoot = state.source.api.replace('/wp-json', '');

	const link = epTerm.link || `${apiRoot}/${taxonomy.replace('post_', '')}/${epTerm.slug}`;

	return {
		id: epTerm.term_id,
		taxonomy,
		name: epTerm.name,
		slug: epTerm.slug,
		link,
	};
}

/**
 * Builds a fake fetch response object as frontity populate method expects
 *
 * @param normalizedResults
 *
 * @returns {Response}
 */
export function buildResponseForPopulate(normalizedResults) {
	return {
		json() {
			return new Promise((resolve) => {
				resolve(normalizedResults);
			});
		},
	} as Response;
}

/**
 * Normalizes a field name.
 *
 * @param field The field name.
 *
 * @returns The normalized field name.
 */
function normalizeKey(field: string): string {
	const normalizedKeyMapping = {
		permalink: 'link',
		name: 'slug',
	};

	const normalizedKey = field.replace('post_', '').replace('_filtered', '');
	return normalizedKeyMapping[normalizedKey] || normalizedKey;
}

/**
 * Checks if a field is a embbeded field
 *
 * @param field The field name.
 *
 * @returns Whether the field is embbeded or not.
 */
function isEmbeddedField(field: string): boolean {
	return ['author', 'terms'].includes(field);
}

/**
 * Checks if a field should contain a { rendered } property.
 *
 * @param field The field name.
 *
 * @returns Whether the field should have a special rendered prop.
 */
function isRenderedField(field: string): boolean {
	return ['title', 'content', 'excerpt'].includes(field);
}

/**
 * Returns frontity's expected taxonomy
 *
 * @param taxonomy The slug of the taxonomy
 *
 * @returns string The public slug of the taxonomy (as in the REST API)
 */
function getPublicTaxonomySlug(taxonomy: string): string {
	const taxonomiesMapping = {
		category: 'categories',
		post_tag: 'tags',
	};

	return taxonomiesMapping[taxonomy] || taxonomy;
}

/**
 * Normalizes an ElasticPress response for the Frontity schema.
 *
 * @param results The raw ElasticPress/ElasticSearch response.
 * @param state The frontity state
 * @returns The normalized respose.
 */
export function normalizeForFrontity(results: Object[], state: State<Packages>) {
	return results.map((result) => {
		const keys = Object.keys(result);
		const normalizedResult = {
			_embedded: {
				author: [],
				'wp:term': [],
			},
		};

		keys.forEach((key) => {
			// skip post_content as we'll use post_content_filtered
			if (key === 'post_content') {
				return;
			}

			const normalizedKey = normalizeKey(key);

			if (isRenderedField(normalizedKey)) {
				normalizedResult[normalizedKey] = { rendered: result[key], protected: false };
			} else if (!isEmbeddedField(normalizedKey)) {
				normalizedResult[normalizedKey] = result[key];
			}

			if (normalizedKey === 'author') {
				normalizedResult[normalizedKey] = result[key].id;
				normalizedResult._embedded.author.push(normalizeAuthor(result[key], state));
			}

			if (normalizedKey === 'terms') {
				const taxonomyTerms = result[key];

				const taxonomies = Object.keys(taxonomyTerms);

				taxonomies.forEach((taxonomy) => {
					const termsForTaxonomy = taxonomyTerms[taxonomy].map((epTerm) =>
						normalizeTerm(taxonomy, epTerm, state),
					);
					const termsForTaxonomyIds = termsForTaxonomy.map((term) => term.id);
					normalizedResult._embedded['wp:term'].push(termsForTaxonomy);
					normalizedResult[getPublicTaxonomySlug(taxonomy)] = termsForTaxonomyIds;
				});
			}
		});

		return normalizedResult;
	});
}
