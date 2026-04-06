"""Key builder utilities for S3 storage paths."""


def build_blob_key(repo_id: str, repo_type: str, blob_id: str) -> str:
    namespace, repo_name = repo_id.split("/", 1)
    return f"hf/{repo_type}--{namespace}--{repo_name}/blobs/{blob_id}"


def build_blob_prefix(repo_id: str, repo_type: str) -> str:
    """Build S3 prefix for all blobs in a repository.

    Args:
        repo_id: Repository ID (e.g., "facebook/bart-large")
        repo_type: Repository type (e.g., "model", "dataset")

    Returns:
        S3 prefix string ending with '/'

    Example:
        >>> build_blob_prefix("facebook/bart-large", "model")
        'hf/model--facebook--bart-large/blobs/'
    """
    namespace, repo_name = repo_id.split("/", 1)
    return f"hf/{repo_type}--{namespace}--{repo_name}/blobs/"


def parse_blob_key(key: str) -> tuple[str, str, str]:
    """Parse a blob S3 key into its components.

    Args:
        key: The S3 object key (e.g., "hf/model--facebook--bart-large/blobs/abcd1234")

    Returns:
        Tuple of (repo_id, repo_type, blob_id)

    Raises:
        ValueError: If the key format is invalid

    Example:
        >>> parse_blob_key("hf/model--facebook--bart-large/blobs/abcd1234567890")
        ('facebook/bart-large', 'model', 'abcd1234567890')
    """
    if not key.startswith("hf/"):
        raise ValueError(f"Invalid blob key format: {key}")

    parts = key[3:].split("/")  # Skip 'hf/' prefix
    if len(parts) < 3 or parts[1] != "blobs":
        raise ValueError(
            f"Invalid blob key format (expected hf/{{repo_type}}--{{namespace}}--{{repo_name}}/blobs/...): {key}"
        )

    # Parse repo_type--namespace--repo_name from first part
    # e.g., "model--facebook--bart-large" -> ("model", "facebook", "bart-large")
    repo_identifier = parts[0]
    identifier_parts = repo_identifier.split("--")
    if len(identifier_parts) != 3:
        raise ValueError(
            f"Invalid repo identifier format (expected {{repo_type}}--{{namespace}}--{{repo_name}}): {repo_identifier}"
        )

    repo_type, namespace, repo_name = identifier_parts
    repo_id = f"{namespace}/{repo_name}"
    blob_id = parts[2]

    return repo_id, repo_type, blob_id


def build_hf_key(repo_id: str, revision: str, file_path: str) -> str:
    """Build S3 key for HuggingFace model/dataset file.

    The key format is: hf/{repo_id}/{revision}/{file_path}

    Args:
        repo_id: Repository ID (e.g., "facebook/bart-large")
        revision: Git revision (e.g., "main", "v1.0", commit hash)
        file_path: File path within the repository (e.g., "pytorch_model.bin")

    Returns:
        S3 object key string

    Example:
        >>> build_hf_key("facebook/bart-large", "main", "pytorch_model.bin")
        'hf/facebook/bart-large/main/pytorch_model.bin'
    """
    return f"hf/{repo_id}/{revision}/{file_path}"


def build_hf_prefix(repo_id: str, revision: str | None = None) -> str:
    """Build S3 prefix for HuggingFace model/dataset.

    Args:
        repo_id: Repository ID (e.g., "facebook/bart-large")
        revision: Optional git revision to narrow down the prefix

    Returns:
        S3 prefix string ending with '/'

    Example:
        >>> build_hf_prefix("facebook/bart-large")
        'hf/facebook/bart-large/'
        >>> build_hf_prefix("facebook/bart-large", "main")
        'hf/facebook/bart-large/main/'
    """
    if revision:
        return f"hf/{repo_id}/{revision}/"
    return f"hf/{repo_id}/"


def parse_hf_key(key: str) -> tuple[str, str, str]:
    """Parse an S3 key into its components.

    Args:
        key: The S3 object key (e.g., "hf/facebook/bart-large/main/config.json")

    Returns:
        Tuple of (repo_id, revision, file_path)

    Raises:
        ValueError: If the key format is invalid

    Example:
        >>> parse_hf_key("hf/facebook/bart-large/main/config.json")
        ('facebook/bart-large', 'main', 'config.json')
        >>> parse_hf_key("hf/facebook/bart-large/main/subdir/file.txt")
        ('facebook/bart-large', 'main', 'subdir/file.txt')
    """
    if not key.startswith("hf/"):
        raise ValueError(f"Invalid HF key format: {key}")

    parts = key[3:].split("/", 2)  # Skip 'hf/' prefix
    if len(parts) < 3:
        raise ValueError(f"Invalid HF key format (expected at least 3 parts): {key}")

    # Handle repo_id with organization (e.g., "facebook/bart-large")
    # Format: hf/{org}/{repo}/{revision}/{filepath}
    # parts[0] = org, parts[1] = repo, parts[2] = revision/filepath
    repo_id = f"{parts[0]}/{parts[1]}"
    remaining = parts[2].split("/", 1)

    revision = remaining[0]
    file_path = remaining[1] if len(remaining) > 1 else ""

    return repo_id, revision, file_path
