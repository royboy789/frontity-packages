import { Handler } from '@frontity/wp-source/types';
import { warn } from 'frontity';
import { PostTypeArchiveWithSearchData } from '@frontity/source/types/data';

const normalizedKeyMapping = {
	permalink: 'link',
	name: 'slug',
};

const specialRenderedFields = ['title', 'content', 'excerpt'];
const embededFields = ['author', 'terms'];

const buildResponseForPopulate = (normalizedResults) => {
	return {
		json() {
			return new Promise((resolve) => {
				resolve(normalizedResults);
			});
		},
	} as Response;
};

const normalizeForFrontity = (results) => {
	return results.map((result) => {
		const keys = Object.keys(result);
		const normalizedResult = {
			_embedded: {
				author: [],
			},
			'wp:term': [],
		};

		keys.forEach((key) => {
			// get rid of post_ prefixes and _filtered suffixes
			const normalizedKey = key.replace('post_', '').replace('_filtered', '');
			const finalNormalizedKey = normalizedKeyMapping[normalizedKey] || normalizedKey;

			if (specialRenderedFields.includes(finalNormalizedKey)) {
				normalizedResult[finalNormalizedKey] = { rendered: result[key], protected: false };
			} else {
				normalizedResult[finalNormalizedKey] = result[key];
			}
		});

		return normalizedResult;
	});
};

/**
 * A {@link Handler} for running search through elasticsearch
 *
 * @param handlerParams
 */
const searchHandler: Handler = async (handlerParams) => {
	const { link, state, force, libraries } = handlerParams;
	const { params } = state.source;
	const perPage = params.per_page || 10;
	const { parse, populate } = libraries.source;

	// @ts-ignore
	const { buildQuery, runEPQuery, searchQuery } = libraries.elasticpress;

	const { page, query, route } = parse(link);

	// if this isn't a search query we fallback to the default handler
	if (!query.s) {
		const originalHandler = libraries.source.handlers.find(
			(handler) => handler.name !== 'epSearch' && handler.pattern === '/',
		);

		if (!originalHandler || typeof originalHandler.func !== 'function') {
			warn(
				'There is something wrong with your frontity setup. Could not find original postHandler',
			);

			return;
		}

		await originalHandler.func(handlerParams);
		return;
	}

	// @ts-ignore
	const endpoint = `${state.elasticpress.node}/${state.elasticpress.indexName}/_doc/_search`;

	const { results, totalResults } = await runEPQuery(
		buildQuery(searchQuery, {
			searchTerm: query.s,
			offset: (page - 1) * perPage,
			perPage,
		}),
		endpoint,
		(hit) => {
			return hit._source;
		},
	);

	const response = buildResponseForPopulate(normalizeForFrontity(results));

	const items = await populate({
		response,
		state,
		force,
	});

	const totalPages = Math.ceil(totalResults / perPage);

	const currentPageData = state.source.data[link];

	const getPageLink = (page: number) =>
		libraries.source.stringify({
			route,
			query,
			page,
		});

	// returns true if next page exists
	const hasNewerPosts = page < totalPages;
	// returns true if previous page exists
	const hasOlderPosts = page > 1;

	const newPageData: PostTypeArchiveWithSearchData = {
		type: 'post',
		items,
		total: totalResults,
		totalPages,
		isArchive: true,
		isPostTypeArchive: true,
		isFetching: false,
		isReady: true,
		// @ts-ignore
		isPostArchive: true,

		// Add next and previous if they exist.
		...(hasOlderPosts && { previous: getPageLink(page - 1) }),
		...(hasNewerPosts && { next: getPageLink(page + 1) }),

		// Add search data if this is a search.
		...(query.s && { isSearch: true, searchQuery: query.s }),
	};

	Object.assign(currentPageData, newPageData);
};

export default searchHandler;