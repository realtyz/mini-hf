"""S3 storage client for managing files in S3-compatible storage."""

import asyncio
from typing import BinaryIO

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from core import settings


class S3Client:
    """Client for S3-compatible storage operations."""

    def __init__(
        self,
        endpoint: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        bucket_name: str | None = None,
        region: str | None = None,
        use_ssl: bool | None = None,
        verify_ssl: bool | None = None,
    ):
        """Initialize S3 client.

        Args:
            endpoint: S3 endpoint URL. Defaults to settings.S3_ENDPOINT.
            access_key: S3 access key. Defaults to settings.S3_ACCESS_KEY.
            secret_key: S3 secret key. Defaults to settings.S3_SECRET_KEY.
            bucket_name: S3 bucket name. Defaults to settings.S3_BUCKET_NAME.
            region: S3 region. Defaults to settings.S3_REGION.
            use_ssl: Whether to use SSL. Defaults to settings.S3_USE_SSL.
            verify_ssl: Whether to verify SSL certificates. Defaults to settings.S3_VERIFY_SSL.
        """
        self.endpoint = endpoint or settings.S3_ENDPOINT
        self.access_key = access_key or settings.S3_ACCESS_KEY
        self.secret_key = secret_key or settings.S3_SECRET_KEY
        self.bucket_name = bucket_name or settings.S3_BUCKET_NAME
        self.region = region or settings.S3_REGION
        self.use_ssl = use_ssl if use_ssl is not None else settings.S3_USE_SSL
        self.verify_ssl = (
            verify_ssl if verify_ssl is not None else settings.S3_VERIFY_SSL
        )

        self._client = None
        self._resource = None

    def _get_client(self):
        """Get or create boto3 S3 client."""
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=self.endpoint,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region,
                use_ssl=self.use_ssl,
                verify=self.verify_ssl,
                config=Config(signature_version="s3v4"),
            )
        return self._client

    def _get_resource(self):
        """Get or create boto3 S3 resource."""
        if self._resource is None:
            self._resource = boto3.resource(
                "s3",
                endpoint_url=self.endpoint,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region,
                use_ssl=self.use_ssl,
                verify=self.verify_ssl,
                config=Config(signature_version="s3v4"),
            )
        return self._resource

    def _upload_fileobj_sync(
        self,
        client,
        file_obj: BinaryIO,
        bucket_name: str,
        key: str,
        extra_args: dict,
    ) -> None:
        """Synchronous upload of file object to S3 (runs in thread pool)."""
        client.upload_fileobj(file_obj, bucket_name, key, ExtraArgs=extra_args)

    def _head_object_sync(self, client, bucket_name: str, key: str) -> dict:
        """Synchronous head_object call (runs in thread pool)."""
        return client.head_object(Bucket=bucket_name, Key=key)

    def _delete_object_sync(self, client, bucket_name: str, key: str) -> dict:
        """Synchronous delete_object call (runs in thread pool)."""
        return client.delete_object(Bucket=bucket_name, Key=key)

    def _list_objects_v2_sync(self, client, bucket_name: str, **kwargs) -> dict:
        """Synchronous list_objects_v2 call (runs in thread pool)."""
        return client.list_objects_v2(Bucket=bucket_name, **kwargs)

    def _download_fileobj_sync(
        self, client, bucket_name: str, key: str, file_obj: BinaryIO
    ) -> None:
        """Synchronous download_fileobj call (runs in thread pool)."""
        client.download_fileobj(bucket_name, key, file_obj)

    def _download_file_sync(
        self, client, bucket_name: str, key: str, file_path: str
    ) -> None:
        """Synchronous download_file call (runs in thread pool)."""
        client.download_file(bucket_name, key, file_path)

    def _delete_objects_sync(
        self, client, bucket_name: str, delete_batch: list[dict]
    ) -> dict:
        """Synchronous delete_objects call (runs in thread pool)."""
        return client.delete_objects(Bucket=bucket_name, Delete={"Objects": delete_batch})

    async def upload_file(
        self,
        key: str,
        file_obj: BinaryIO,
        content_type: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> dict:
        """Upload a file to S3.

        Args:
            key: The object key (path) in the bucket.
            file_obj: File-like object to upload.
            content_type: MIME type of the file.
            metadata: Additional metadata to store with the object.

        Returns:
            Dict with 'key', 'etag', and 'size' of the uploaded file.

        Raises:
            ClientError: If upload fails.
        """
        client = self._get_client()

        extra_args: dict[str, str | dict[str, str]] = {}
        if content_type:
            extra_args["ContentType"] = content_type
        if metadata:
            extra_args["Metadata"] = metadata

        # Calculate file size and md5 for verification
        file_obj.seek(0, 2)  # Seek to end
        file_size = file_obj.tell()
        file_obj.seek(0)  # Reset to beginning

        # Run sync boto3 calls in thread pool to avoid blocking event loop
        await asyncio.to_thread(
            self._upload_fileobj_sync,
            client,
            file_obj,
            self.bucket_name,
            key,
            extra_args,
        )

        # Get ETag from the uploaded object
        response = await asyncio.to_thread(
            self._head_object_sync, client, self.bucket_name, key
        )

        return {
            "key": key,
            "etag": response["ETag"].strip('"'),
            "size": file_size,
            "last_modified": response["LastModified"],
        }

    def _upload_file_sync(
        self,
        client,
        file_path: str,
        bucket_name: str,
        key: str,
        extra_args: dict,
    ) -> None:
        """Synchronous upload of file from path to S3 (runs in thread pool)."""
        client.upload_file(
            file_path, bucket_name, key,
            ExtraArgs=extra_args,
        )

    async def upload_file_from_path(
        self,
        key: str,
        file_path: str,
        content_type: str | None = None,
        metadata: dict[str, str] | None = None,
    ) -> dict:
        """Upload a file from local path to S3.

        Args:
            key: The object key (path) in the bucket.
            file_path: Local file path to upload.
            content_type: MIME type of the file.
            metadata: Additional metadata to store with the object.

        Returns:
            Dict with 'key', 'etag', and 'size' of the uploaded file.

        Raises:
            ClientError: If upload fails.
        """
        client = self._get_client()

        extra_args: dict[str, str | dict[str, str]] = {}
        if content_type:
            extra_args["ContentType"] = content_type
        if metadata:
            extra_args["Metadata"] = metadata

        # Run sync boto3 calls in thread pool to avoid blocking event loop
        await asyncio.to_thread(
            self._upload_file_sync,
            client,
            file_path,
            self.bucket_name,
            key,
            extra_args,
        )

        response = await asyncio.to_thread(
            self._head_object_sync, client, self.bucket_name, key
        )

        return {
            "key": key,
            "etag": response["ETag"].strip('"'),
            "size": response["ContentLength"],
            "last_modified": response["LastModified"],
        }

    async def get_file_metadata(self, key: str) -> dict | None:
        """Get metadata for a file in S3.

        Args:
            key: The object key (path) in the bucket.

        Returns:
            Dict with file metadata including 'key', 'size', 'etag',
            'last_modified', 'content_type', and 'metadata' (custom metadata).
            Returns None if file doesn't exist.

        Raises:
            ClientError: If the request fails for reasons other than 404.
        """
        client = self._get_client()

        try:
            response = await asyncio.to_thread(
                self._head_object_sync, client, self.bucket_name, key
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return None
            raise

        return {
            "key": key,
            "size": response["ContentLength"],
            "etag": response["ETag"].strip('"'),
            "last_modified": response["LastModified"],
            "content_type": response.get("ContentType"),
            "metadata": response.get("Metadata", {}),
        }

    async def create_presigned_url(
        self,
        key: str,
        expiration: int = 300,
        http_method: str = "get",
        content_type: str | None = None,
        download_filename: str | None = None,
    ) -> str:
        """Create a presigned URL for accessing a file.

        Args:
            key: The object key (path) in the bucket.
            expiration: URL expiration time in seconds (default: 1 hour).
            http_method: HTTP method for the URL ('get' or 'put').
            content_type: Required Content-Type for PUT requests.
            download_filename: If provided, sets Content-Disposition header for download.

        Returns:
            Presigned URL string.

        Raises:
            ClientError: If URL generation fails.
        """
        client = self._get_client()

        params = {
            "Bucket": self.bucket_name,
            "Key": key,
        }
        if content_type and http_method.lower() == "put":
            params["ContentType"] = content_type
        if download_filename and http_method.lower() == "get":
            params["ResponseContentDisposition"] = f'attachment; filename="{download_filename}"'

        url = client.generate_presigned_url(
            ClientMethod=f"{http_method.lower()}_object",
            Params=params,
            ExpiresIn=expiration,
        )

        return url

    async def delete_file(self, key: str) -> bool:
        """Delete a single file from S3.

        Args:
            key: The object key (path) in the bucket.

        Returns:
            True if deleted successfully, False if file didn't exist.

        Raises:
            ClientError: If deletion fails for reasons other than 404.
        """
        client = self._get_client()

        try:
            await asyncio.to_thread(
                self._delete_object_sync, client, self.bucket_name, key
            )
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return False
            raise

    def _list_objects_paginated_sync(
        self, client, bucket_name: str, prefix: str
    ) -> list[dict]:
        """Synchronously list all objects with prefix using paginator."""
        paginator = client.get_paginator("list_objects_v2")
        objects = []
        for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
            if "Contents" in page:
                objects.extend(page["Contents"])
        return objects

    async def delete_directory(self, prefix: str) -> int:
        """Delete all files under a directory prefix.

        Args:
            prefix: The directory prefix to delete (e.g., 'path/to/dir/').

        Returns:
            Number of objects deleted.

        Raises:
            ClientError: If deletion fails.
        """
        client = self._get_client()

        # Ensure prefix ends with / for directory deletion
        if not prefix.endswith("/"):
            prefix += "/"

        # List all objects with the prefix (in thread pool)
        objects = await asyncio.to_thread(
            self._list_objects_paginated_sync, client, self.bucket_name, prefix
        )

        deleted_count = 0
        delete_batch = []

        for obj in objects:
            delete_batch.append({"Key": obj["Key"]})

            # S3 delete_objects supports up to 1000 keys per request
            if len(delete_batch) >= 1000:
                response = await asyncio.to_thread(
                    self._delete_objects_sync, client, self.bucket_name, delete_batch
                )
                deleted_count += len(response.get("Deleted", []))
                delete_batch = []

        # Delete remaining objects
        if delete_batch:
            response = await asyncio.to_thread(
                self._delete_objects_sync, client, self.bucket_name, delete_batch
            )
            deleted_count += len(response.get("Deleted", []))

        return deleted_count

    async def file_exists(self, key: str) -> bool:
        """Check if a file exists in S3.

        Args:
            key: The object key (path) in the bucket.

        Returns:
            True if file exists, False otherwise.
        """
        client = self._get_client()

        try:
            await asyncio.to_thread(
                self._head_object_sync, client, self.bucket_name, key
            )
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return False
            raise

    async def list_files(
        self,
        prefix: str = "",
        max_keys: int = 1000,
        continuation_token: str | None = None,
    ) -> dict:
        """List files in S3 with optional prefix.

        Args:
            prefix: Only list objects with this prefix.
            max_keys: Maximum number of keys to return.
            continuation_token: Token for pagination.

        Returns:
            Dict with 'files' (list of file metadata) and optional 'continuation_token'.
        """
        client = self._get_client()

        kwargs = {
            "Prefix": prefix,
            "MaxKeys": max_keys,
        }
        if continuation_token:
            kwargs["ContinuationToken"] = continuation_token

        response = await asyncio.to_thread(
            self._list_objects_v2_sync, client, self.bucket_name, **kwargs
        )

        files = []
        if "Contents" in response:
            for obj in response["Contents"]:
                files.append(
                    {
                        "key": obj["Key"],
                        "size": obj["Size"],
                        "etag": obj["ETag"].strip('"'),
                        "last_modified": obj["LastModified"],
                    }
                )

        result: dict[str, list[dict] | str] = {"files": files}
        if response.get("IsTruncated"):
            next_token = response.get("NextContinuationToken")
            if next_token:
                result["continuation_token"] = next_token

        return result

    async def download_file(self, key: str, file_obj: BinaryIO) -> None:
        """Download a file from S3 to a file-like object.

        Args:
            key: The object key (path) in the bucket.
            file_obj: File-like object to write to.

        Raises:
            ClientError: If download fails.
        """
        client = self._get_client()
        await asyncio.to_thread(
            self._download_fileobj_sync, client, self.bucket_name, key, file_obj
        )

    async def download_file_to_path(self, key: str, file_path: str) -> None:
        """Download a file from S3 to a local file path.

        Args:
            key: The object key (path) in the bucket.
            file_path: Local file path to save to.

        Raises:
            ClientError: If download fails.
        """
        client = self._get_client()
        await asyncio.to_thread(
            self._download_file_sync, client, self.bucket_name, key, file_path
        )

    def _get_bucket_stats_sync(self, client, bucket_name: str) -> dict:
        """Synchronously get bucket statistics (runs in thread pool)."""
        total_size = 0
        total_files = 0
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket_name):
            if "Contents" in page:
                for obj in page["Contents"]:
                    total_files += 1
                    total_size += obj["Size"]
        return {"total_files": total_files, "total_size": total_size}

    async def get_bucket_stats(self) -> dict:
        """Get bucket statistics (total files and total size).

        Returns:
            Dict with 'total_files' and 'total_size' keys.

        Raises:
            ClientError: If the request fails.

        Note:
            This operation can be slow for large buckets as it needs to
            iterate through all objects. Consider caching the result.
        """
        client = self._get_client()
        return await asyncio.to_thread(
            self._get_bucket_stats_sync, client, self.bucket_name
        )


# Global client instance
s3_client = S3Client()
