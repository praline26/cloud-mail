import http from '@/axios/index.js'

export function userBatchAdd(form) {
    return http.post('/user/batchAdd', form)
}

export function userBatchList(params) {
    return http.get('/user/batchList', {params: {...params}})
}

export function userBatchItems(batchId) {
    return http.get('/user/batchItems', {params: {batchId}})
}

export function userBatchDelete(batchId) {
    return http.delete('/user/batchDelete', {params: {batchId}})
}
